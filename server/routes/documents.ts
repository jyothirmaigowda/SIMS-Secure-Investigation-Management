import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'fs';

import { db } from '../db.ts';
import { logAuditEvent } from '../audit.ts';
import {
  requireAuth,
  requireSecurityCheck,
  evaluateAccessPolicy,
  AuthenticatedRequest,
} from '../auth.ts';
import {
  storeInVault,
  validateFileType,
  getVaultFilePath,
  verifyVaultFileIntegrity,
} from '../vault.ts';
import { createIntegrityAnchor } from '../blockchain.ts';

const router = Router();

const MAX_DOCUMENT_FILE_SIZE = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_FILE_SIZE,
  },
});

const CreateDocSchema = z.object({
  case_id: z.string().min(1),

  title: z.string().min(3),

  doc_type: z.enum([
    'FIR',
    'SEARCH_WARRANT',
    'AFFIDAVIT',
    'INTERROGATION_TRANSCRIPT',
    'FORENSIC_REPORT',
    'WITNESS_DEPOSITION',
    'SUBPOENA_RETURN',
    'LEGAL_INDICTMENT_MEMO',
  ]),

  sensitivity: z.enum([
    'STANDARD',
    'CONFIDENTIAL',
    'SECRET',
    'RESTRICTED',
  ]),

  content_text: z.string().optional(),
});

const DocumentDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
});

/**
 * GET /api/documents
 */
router.get(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const caseId =
      typeof req.query.caseId === 'string'
        ? req.query.caseId.trim()
        : undefined;
    const user = req.user!;

    try {
      if (caseId) {
        const access = await evaluateAccessPolicy(
          user,
          'DOCUMENT_READ',
          caseId,
        );

        if (!access.allowed) {
          return res.status(403).json({
            error: 'AUTHORIZATION_DENIED',
            message: access.reason,
          });
        }
      }

      let query = `
        SELECT
          d.*,
          c.case_number,
          c.title as case_title,
          c.jurisdiction as case_jurisdiction,
          u.full_name as author_name,
          u.badge_number as author_badge,
          s.full_name as signer_name,
          s.badge_number as signer_badge
        FROM case_documents d
        JOIN cases c ON d.case_id = c.id
        JOIN users u ON d.author_id = u.id
        LEFT JOIN users s ON d.signed_by_id = s.id
      `;

      const params: any[] = [];

      if (caseId) {
        query += ` WHERE d.case_id = $1`;
        params.push(caseId);
      } else if (user.role === 'SUPERVISOR' || user.role === 'LEGAL') {
        query += `
          WHERE c.jurisdiction = $1
             OR EXISTS (
               SELECT 1
               FROM case_assignments ca
               WHERE ca.case_id = c.id
                 AND ca.user_id = $2
                 AND ca.can_read = TRUE
             )
        `;

        params.push(user.jurisdiction, user.id);
      } else if (user.role === 'IO') {
        query += `
          WHERE c.lead_io_id = $1
             OR EXISTS (
               SELECT 1
               FROM case_assignments ca
               WHERE ca.case_id = c.id
                 AND ca.user_id = $1
                 AND ca.can_read = TRUE
             )
        `;

        params.push(user.id);
      }

      query += ` ORDER BY d.created_at DESC`;

      const docsRes = await db.query(query, params);

      return res.json({
        documents: docsRes.rows,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: err.message,
      });
    }
  },
);

/**
 * GET /api/documents/:id
 */
router.get(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;

    try {
      const docRes = await db.query(
        `
        SELECT
          d.*,
          c.case_number,
          c.title as case_title,
          c.sensitivity as case_sensitivity,
          u.full_name as author_name,
          u.badge_number as author_badge,
          s.full_name as signer_name,
          s.badge_number as signer_badge
        FROM case_documents d
        JOIN cases c ON d.case_id = c.id
        JOIN users u ON d.author_id = u.id
        LEFT JOIN users s ON d.signed_by_id = s.id
        WHERE d.id = $1
        `,
        [id],
      );

      if (docRes.rows.length === 0) {
        return res.status(404).json({
          error: 'DOCUMENT_NOT_FOUND',
        });
      }

      const doc = docRes.rows[0] as any;

      const evalResult = await evaluateAccessPolicy(
        req.user!,
        'DOCUMENT_READ',
        doc.case_id,
      );

      if (!evalResult.allowed) {
        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: evalResult.reason,
        });
      }

      return res.json({
        document: doc,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: err.message,
      });
    }
  },
);

/** Returns immutable document version metadata for an authorized case. */
router.get(
  '/:id/versions',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const documentResult = await db.query(
        'SELECT case_id FROM case_documents WHERE id = $1',
        [req.params.id],
      );

      if (!documentResult.rows.length) {
        return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
      }

      const caseId = (documentResult.rows[0] as any).case_id;
      const access = await evaluateAccessPolicy(req.user!, 'DOCUMENT_READ', caseId);

      if (!access.allowed) {
        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      const versions = await db.query(
        `SELECT id, document_id, version_number, title, file_name, mime_type,
                file_size, sha256_hash, author_id, change_summary, created_at
         FROM document_versions
         WHERE document_id = $1
         ORDER BY version_number DESC`,
        [req.params.id],
      );

      return res.json({ versions: versions.rows });
    } catch {
      return res.status(500).json({
        error: 'DOCUMENT_VERSION_LOOKUP_ERROR',
        message: 'Document version history could not be retrieved.',
      });
    }
  },
);

/**
 * POST /api/documents
 *
 * IMPORTANT:
 * Multer runs before requireSecurityCheck because
 * case_id is inside multipart/form-data.
 */
router.post(
  '/',
  requireAuth,
  upload.single('file'),
  requireSecurityCheck('DOCUMENT_CREATE'),
  async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = CreateDocSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.format(),
      });
    }

    const data = parseResult.data;
    const user = req.user!;

    const contentText = data.content_text || '';

    let vaultMeta: Awaited<
      ReturnType<typeof storeInVault>
    > | null = null;
    let databaseCommitted = false;

    if (req.file) {
      const fileTypeCheck = validateFileType(
        req.file.originalname,
        req.file.buffer,
        req.file.mimetype,
      );

      if (!fileTypeCheck.valid) {
        return res.status(400).json({
          error: 'INVALID_FILE_TYPE',
          message: fileTypeCheck.reason,
        });
      }

      vaultMeta = await storeInVault(
        'documents',
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );
    }

    const id = `doc_${crypto.randomUUID().slice(0, 8)}`;

    const versionId =
      `docv_${crypto.randomUUID().slice(0, 8)}`;

    const docNum =
      `DOC-${Date.now().toString().slice(-4)}-${Math.floor(
        100 + Math.random() * 900,
      )}`;

    const sha256Hash = vaultMeta
      ? vaultMeta.sha256Hash
      : crypto
          .createHash('sha256')
          .update(contentText)
          .digest('hex');

    try {
      await db.query('BEGIN');

      await db.query(
        `
        INSERT INTO case_documents (
          id,
          case_id,
          document_number,
          title,
          doc_type,
          sensitivity,
          version,
          content_text,
          file_name,
          file_path,
          mime_type,
          file_size,
          sha256_hash,
          author_id,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          1,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          'SUBMITTED'
        )
        `,
        [
          id,
          data.case_id,
          docNum,
          data.title,
          data.doc_type,
          data.sensitivity,
          contentText,
          vaultMeta?.fileName || null,
          vaultMeta?.filePath || null,
          vaultMeta?.mimeType || null,
          vaultMeta?.fileSize || null,
          sha256Hash,
          user.id,
        ],
      );

      await db.query(
        `
        INSERT INTO document_versions (
          id,
          document_id,
          case_id,
          version_number,
          title,
          content_text,
          file_name,
          file_path,
          mime_type,
          file_size,
          sha256_hash,
          author_id,
          change_summary
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13
        )
        `,
        [
          versionId,
          id,
          data.case_id,
          1,
          data.title,
          contentText,
          vaultMeta?.fileName || null,
          vaultMeta?.filePath || null,
          vaultMeta?.mimeType || null,
          vaultMeta?.fileSize || null,
          sha256Hash,
          user.id,
          'Initial Submission',
        ],
      );

      await db.query('COMMIT');
      databaseCommitted = true;

      await logAuditEvent({
        userId: user.id,
        action: 'DOCUMENT_AUTHORED',
        targetType: 'DOCUMENT',
        targetId: id,
        caseId: data.case_id,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          docNumber: docNum,
          docType: data.doc_type,
          sha256: sha256Hash,
          author: user.full_name,
          fileName: vaultMeta?.fileName,
        },
        status: 'SUCCESS',
      });

      const integrityAnchor = await createIntegrityAnchor({
        caseId: data.case_id,
        entityType: 'DOCUMENT_VERSION',
        entityId: versionId,
        eventType: 'DOCUMENT_VERSION_CREATED',
        sha256Hash,
        actorId: user.id,
        metadata: {
          documentId: id,
          version: 1,
          mimeType: vaultMeta?.mimeType || 'text/plain',
          fileSize: vaultMeta?.fileSize || Buffer.byteLength(contentText),
        },
      }).catch((error) => {
        console.error('[DOCUMENT] Integrity anchor failed after commit:', error);
        return null;
      });

      return res.status(201).json({
        success: true,
        documentId: id,
        documentNumber: docNum,
        sha256Hash,
        integrityAnchor,
      });
    } catch (err: any) {
      await db.query('ROLLBACK');

      // The encrypted object is created before the metadata transaction. If
      // persistence fails, remove only that unreferenced newly stored object.
      if (!databaseCommitted && vaultMeta?.filePath) {
        await fs.promises.unlink(vaultMeta.filePath).catch(() => {});
      }

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: err.message,
      });
    }
  },
);

/**
 * POST /api/documents/:id/sign
 */
router.post(
  '/:id/sign',
  requireAuth,
  requireSecurityCheck('DOCUMENT_SIGN'),
  async (req: AuthenticatedRequest, res: Response) => {
    const docId = req.params.id;
    const user = req.user!;
    const parseResult = DocumentDecisionSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
    }

    const { decision } = parseResult.data;

    try {
      const docRes = await db.query(
        'SELECT * FROM case_documents WHERE id = $1',
        [docId],
      );

      if (docRes.rows.length === 0) {
        return res.status(404).json({
          error: 'DOCUMENT_NOT_FOUND',
        });
      }

      const doc = docRes.rows[0] as any;

      const newStatus =
        decision === 'REJECTED'
          ? 'REJECTED'
          : 'APPROVED';

      await db.query(
        `
        UPDATE case_documents
        SET
          status = $1,
          signed_by_id = $2,
          signed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        `,
        [newStatus, user.id, docId],
      );

      await logAuditEvent({
        userId: user.id,
        action:
          newStatus === 'APPROVED'
            ? 'DOCUMENT_SIGNED_ENDORSED'
            : 'DOCUMENT_ENDORSEMENT_REJECTED',
        targetType: 'DOCUMENT',
        targetId: docId,
        caseId: doc.case_id,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          docNumber: doc.document_number,
          signer: user.full_name,
          badge: user.badge_number,
          role: user.role,
          decision: newStatus,
        },
        status: 'SUCCESS',
      });

      return res.json({
        success: true,
        status: newStatus,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: err.message,
      });
    }
  },
);

/**
 * GET /api/documents/:id/download
 *
 * Controlled document release:
 * authentication → authorization → vault validation →
 * AES-256-GCM verification/decryption → SHA-256 verification.
 */
router.get(
  '/:id/download',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const docId = req.params.id;

    try {
      const docRes = await db.query(
        'SELECT * FROM case_documents WHERE id = $1',
        [docId],
      );

      if (docRes.rows.length === 0) {
        return res.status(404).json({
          error: 'DOCUMENT_NOT_FOUND',
        });
      }

      const doc = docRes.rows[0] as any;
      const user = req.user!;

      const accessResult = await evaluateAccessPolicy(
        user,
        'DOCUMENT_READ',
        doc.case_id,
      );

      if (!accessResult.allowed) {
        await logAuditEvent({
          userId: user.id,
          action: 'DOCUMENT_VIEW',
          targetType: 'DOCUMENT',
          targetId: docId,
          caseId: doc.case_id,
          ipAddress: req.ip || '127.0.0.1',
          details: {
            action: 'DOWNLOAD_VAULT_FILE',
            fileName: doc.file_name,
            reason: accessResult.reason,
          },
          status: 'DENIED',
        });

        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: accessResult.reason,
        });
      }

      if (!doc.file_path) {
        return res.status(404).json({
          error: 'NO_FILE_ATTACHED',
          message:
            'This document does not have a physical file attachment.',
        });
      }

      const securePath =
        getVaultFilePath(doc.file_path);

      if (!securePath) {
        await logAuditEvent({
          userId: user.id,
          action: 'DOCUMENT_VIEW',
          targetType: 'DOCUMENT',
          targetId: docId,
          caseId: doc.case_id,
          ipAddress: req.ip || '127.0.0.1',
          details: {
            action: 'DOWNLOAD_VAULT_FILE',
            fileName: doc.file_name,
            reason:
              'Vault file not found or invalid path.',
          },
          status: 'SECURITY_ALERT',
        });

        return res.status(404).json({
          error: 'FILE_NOT_FOUND',
          message:
            'The requested file could not be located in the secure vault.',
        });
      }

      const integrityResult =
        await verifyVaultFileIntegrity(
          securePath,
          doc.sha256_hash,
        );

      if (integrityResult.failure) {
        await logAuditEvent({
          userId: user.id,
          action: 'DOCUMENT_VIEW',
          targetType: 'DOCUMENT',
          targetId: docId,
          caseId: doc.case_id,
          ipAddress: req.ip || '127.0.0.1',
          details: {
            action: 'DOWNLOAD_BLOCKED_VAULT_ERROR',
            fileName: doc.file_name,
            failure: integrityResult.failure,
          },
          status: 'SECURITY_ALERT',
        });

        return res.status(409).json({
          error: 'VAULT_VERIFICATION_ERROR',
          message: 'The document could not be authenticated from the secure vault.',
        });
      }

      if (!integrityResult.verified) {
        await logAuditEvent({
          userId: user.id,
          action: 'DOCUMENT_VIEW',
          targetType: 'DOCUMENT',
          targetId: docId,
          caseId: doc.case_id,
          ipAddress: req.ip || '127.0.0.1',
          details: {
            action:
              'DOWNLOAD_BLOCKED_INTEGRITY_FAILURE',
            fileName: doc.file_name,
            expectedSha256: doc.sha256_hash,
            calculatedSha256:
              integrityResult.calculatedHash,
          },
          status: 'SECURITY_ALERT',
        });

        return res.status(409).json({
          error: 'INTEGRITY_VERIFICATION_FAILED',
          message:
            'The document failed secure vault integrity verification and was not released.',
        });
      }

      const fileBytes = integrityResult.plaintext!;

      await logAuditEvent({
        userId: user.id,
        action: 'DOCUMENT_VIEW',
        targetType: 'DOCUMENT',
        targetId: docId,
        caseId: doc.case_id,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          action: 'DOWNLOAD_VAULT_FILE',
          fileName: doc.file_name,
          sha256:
            integrityResult.calculatedHash,
          integrity: 'VERIFIED',
          encryption: 'AES-256-GCM',
        },
        status: 'SUCCESS',
      });

      res.setHeader(
        'Content-Type',
        doc.mime_type ||
          'application/octet-stream',
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${doc.file_name || 'document.dat'}"`,
      );

      res.setHeader(
        'Content-Length',
        fileBytes.length.toString(),
      );

      return res.end(fileBytes);
    } catch (err: any) {
      console.error(
        '[DOCUMENT DOWNLOAD] Failed:',
        err,
      );

      return res.status(500).json({
        error: 'DOCUMENT_DOWNLOAD_ERROR',
        message:
          'The document could not be released from the secure vault.',
      });
    }
  },
);

export default router;
