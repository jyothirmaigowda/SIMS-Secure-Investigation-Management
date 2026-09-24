import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'fs';

import { db } from '../db.ts';
import { logAuditEvent } from '../audit.ts';
import {
  requireAuth,
  AuthenticatedRequest,
} from '../auth.ts';
import { evaluateAccessPolicy } from '../accessControl.ts';
import {
  storeInVault,
  validateFileType,
  verifyVaultFileIntegrity,
  getVaultFilePath,
} from '../vault.ts';
import { createIntegrityAnchor } from '../blockchain.ts';

const router = Router();

const MAX_EVIDENCE_FILE_SIZE = 100 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_EVIDENCE_FILE_SIZE,
  },
});

const RegisterEvidenceSchema = z.object({
  case_id: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(5000),
  category: z.enum([
    'DIGITAL',
    'PHYSICAL',
    'FORENSIC',
    'DOCUMENTARY',
    'BIOLOGICAL',
    'SURVEILLANCE',
  ]),
  storage_location: z.string().trim().min(2).max(500),
  condition_notes: z.string().trim().max(5000).optional(),
  collected_at: z.string().datetime().optional(),
});

const CustodyTransferSchema = z.object({
  transferred_to_id: z.string().min(1),
  action_type: z.enum([
    'TRANSFER',
    'FORENSIC_ANALYSIS',
    'COURT_EVIDENCE_ROOM',
    'SAFE_DEPOSITORY',
    'AUTHORIZED_INSPECTION',
  ]),
  reason: z.string().trim().min(3).max(2000),
  location: z.string().trim().min(2).max(500),
});

function safeFileName(fileName: string | null | undefined): string {
  return String(fileName || 'evidence')
    .replace(/["\r\n]/g, '')
    .replace(/[^\w.\- ()]/g, '_')
    .slice(0, 255);
}

async function auditDenied(
  req: AuthenticatedRequest,
  action: string,
  targetType: string,
  targetId: string,
  caseId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    userId: req.user?.id || 'SYSTEM',
    action,
    targetType,
    targetId,
    caseId,
    ipAddress: req.ip || '127.0.0.1',
    details,
    status: 'DENIED',
  });
}

async function auditSecurityAlert(
  req: AuthenticatedRequest,
  action: string,
  targetType: string,
  targetId: string,
  caseId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    userId: req.user?.id || 'SYSTEM',
    action,
    targetType,
    targetId,
    caseId,
    ipAddress: req.ip || '127.0.0.1',
    details,
    status: 'SECURITY_ALERT',
  });
}

function createCustodyHash(payload: string): string {
  return crypto
    .createHash('sha256')
    .update(payload)
    .digest('hex');
}

/* =========================================================
   GET /api/evidence
   ========================================================= */

router.get(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const caseId =
      typeof req.query.caseId === 'string'
        ? req.query.caseId
        : undefined;

    const user = req.user!;

    try {
      let query = `
        SELECT
          e.*,
          c.case_number,
          c.title AS case_title,
          c.jurisdiction AS case_jurisdiction,
          u.full_name AS holder_name,
          u.badge_number AS holder_badge,
          cb.full_name AS collector_name,
          cb.badge_number AS collector_badge
        FROM evidence_items e
        JOIN cases c ON e.case_id = c.id
        LEFT JOIN users u
          ON e.current_custody_holder_id = u.id
        LEFT JOIN users cb
          ON e.collected_by_id = cb.id
      `;

      const params: unknown[] = [];
      const conditions: string[] = [];

      if (caseId) {
        const access = await evaluateAccessPolicy(
          user,
          'EVIDENCE_VIEW',
          caseId,
        );

        if (!access.allowed) {
          await auditDenied(
            req,
            'EVIDENCE_LIST_DENIED',
            'CASE',
            caseId,
            caseId,
            { reason: access.reason },
          );

          return res.status(403).json({
            error: 'AUTHORIZATION_DENIED',
            message: access.reason,
          });
        }

        conditions.push(`e.case_id = $1`);
        params.push(caseId);
      } else {
        if (user.role === 'ADMIN') {
          // System-wide visibility.
        } else if (user.role === 'SUPERVISOR') {
          conditions.push(`c.jurisdiction = $1`);
          params.push(user.jurisdiction);
        } else if (user.role === 'IO') {
          conditions.push(`
            (
              EXISTS (
                SELECT 1
                FROM case_assignments ca
                WHERE ca.case_id = e.case_id
                  AND ca.user_id = $1
                  AND ca.can_read = TRUE
              )
              OR c.lead_io_id = $1
            )
          `);
          params.push(user.id);
        } else if (user.role === 'LEGAL') {
          conditions.push(`
            EXISTS (
              SELECT 1
              FROM case_assignments ca
              WHERE ca.case_id = e.case_id
                AND ca.user_id = $1
                AND ca.can_read = TRUE
            )
          `);
          params.push(user.id);
        } else {
          return res.status(403).json({
            error: 'AUTHORIZATION_DENIED',
            message:
              'This role cannot access the evidence registry.',
          });
        }
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` ORDER BY e.created_at DESC`;

      const result = await db.query(query, params);

      return res.json({
        evidence: result.rows,
      });
    } catch (err) {
      console.error('[EVIDENCE] List failed:', err);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message:
          'The evidence registry could not be loaded.',
      });
    }
  },
);

/* =========================================================
   GET /api/evidence/:id
   ========================================================= */

router.get(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const evidenceId = req.params.id;

    try {
      const result = await db.query(
        `
          SELECT
            e.*,
            c.case_number,
            c.title AS case_title,
            c.sensitivity AS case_sensitivity,
            c.jurisdiction AS case_jurisdiction,
            c.lead_io_id AS lead_io_id,
            u.full_name AS holder_name,
            u.badge_number AS holder_badge,
            cb.full_name AS collector_name,
            cb.badge_number AS collector_badge
          FROM evidence_items e
          JOIN cases c ON e.case_id = c.id
          LEFT JOIN users u
            ON e.current_custody_holder_id = u.id
          LEFT JOIN users cb
            ON e.collected_by_id = cb.id
          WHERE e.id = $1
        `,
        [evidenceId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'EVIDENCE_NOT_FOUND',
          message: 'Evidence item was not found.',
        });
      }

      const item = result.rows[0] as any;

      const access = await evaluateAccessPolicy(
        req.user!,
        'EVIDENCE_VIEW',
        item.case_id,
        { evidenceId },
      );

      if (!access.allowed) {
        await auditDenied(
          req,
          'EVIDENCE_VIEW_DENIED',
          'EVIDENCE',
          evidenceId,
          item.case_id,
          { reason: access.reason },
        );

        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      const custodyResult = await db.query(
        `
          SELECT
            cc.id,
            cc.evidence_id,
            cc.case_id,
            cc.transferred_from_id,
            cc.transferred_to_id,
            cc.action_type,
            cc.reason,
            cc.location,
            cc.signature_hash,
            cc.recorded_at,

            ufrom.full_name AS from_name,
            ufrom.badge_number AS from_badge,

            uto.full_name AS to_name,
            uto.badge_number AS to_badge

          FROM chain_of_custody cc

          LEFT JOIN users ufrom
            ON cc.transferred_from_id = ufrom.id

          LEFT JOIN users uto
            ON cc.transferred_to_id = uto.id

          WHERE cc.evidence_id = $1
            AND cc.case_id = $2

          ORDER BY cc.recorded_at ASC, cc.id ASC
        `,
        [evidenceId, item.case_id],
      );

      return res.json({
        evidence: item,
        custodyChain: custodyResult.rows,
        custody_chain: custodyResult.rows,
      });
    } catch (err) {
      console.error('[EVIDENCE] Detail failed:', err);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message:
          'The evidence record could not be loaded.',
      });
    }
  },
);

/* =========================================================
   POST /api/evidence
   ========================================================= */

router.post(
  '/',
  requireAuth,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    const parsed =
      RegisterEvidenceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
    }

    const data = parsed.data;

    if (!req.file) {
      return res.status(400).json({
        error: 'FILE_REQUIRED',
        message:
          'A digital evidence attachment is required for evidence registration.',
      });
    }

    let storedVaultPath: string | null = null;
    let transactionStarted = false;

    try {
      const caseResult = await db.query(
        `
          SELECT
            id,
            case_number,
            title,
            jurisdiction,
            sensitivity,
            status
          FROM cases
          WHERE id = $1
        `,
        [data.case_id],
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message:
            'The requested investigation case does not exist.',
        });
      }

      const investigationCase =
        caseResult.rows[0] as any;

      const access = await evaluateAccessPolicy(
        user,
        'EVIDENCE_ADD',
        data.case_id,
      );

      if (!access.allowed) {
        await auditDenied(
          req,
          'EVIDENCE_INTAKE_DENIED',
          'CASE',
          data.case_id,
          data.case_id,
          {
            reason: access.reason,
            title: data.title,
          },
        );

        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      if (user.role !== 'IO') {
        await auditDenied(
          req,
          'EVIDENCE_INTAKE_DENIED',
          'CASE',
          data.case_id,
          data.case_id,
          {
            reason: 'EVIDENCE_INTAKE_RESTRICTED_TO_IO',
            role: user.role,
          },
        );

        return res.status(403).json({
          error: 'ROLE_OPERATION_DENIED',
          message:
            'Only an Investigation Officer can register new evidence.',
        });
      }

      const fileCheck = validateFileType(
        req.file.originalname,
        req.file.buffer,
        req.file.mimetype,
      );

      if (!fileCheck.valid) {
        await auditSecurityAlert(
          req,
          'EVIDENCE_FILE_REJECTED',
          'CASE',
          data.case_id,
          data.case_id,
          {
            reason: fileCheck.reason,
            originalFileName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
          },
        );

        return res.status(400).json({
          error: 'INVALID_FILE_TYPE',
          message: fileCheck.reason,
        });
      }

      /*
       * Integrity is calculated over the ORIGINAL plaintext.
       * The plaintext is then encrypted with AES-256-GCM
       * before being written to the private vault.
       */
      const vaultMeta = await storeInVault(
        'evidence',
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );

      storedVaultPath = vaultMeta.filePath;

      const id =
        `evd_${crypto.randomUUID().slice(0, 8)}`;

      const trackingNumber =
        `EVD-${Date.now()
          .toString()
          .slice(-6)}-${crypto.randomInt(100, 1000)}`;

      const custodyId =
        `cust_${crypto.randomUUID().slice(0, 8)}`;

      const recordedAt =
        new Date().toISOString();

      const signatureHash = createCustodyHash(
        [
          custodyId,
          id,
          data.case_id,
          user.id,
          user.id,
          'INITIAL_COLLECTION',
          data.storage_location,
          vaultMeta.sha256Hash,
          recordedAt,
        ].join('|'),
      );

      await db.query('BEGIN');
      transactionStarted = true;

      await db.query(
        `
          INSERT INTO evidence_items (
            id,
            case_id,
            tracking_number,
            title,
            description,
            category,
            storage_location,
            condition_notes,
            file_name,
            file_path,
            file_size,
            sha256_hash,
            mime_type,
            current_custody_holder_id,
            collected_by_id,
            collected_at,
            status
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
            $13,
            $14,
            $15,
            COALESCE($16, CURRENT_TIMESTAMP),
            'VAULT_SECURED'
          )
        `,
        [
          id,
          data.case_id,
          trackingNumber,
          data.title,
          data.description,
          data.category,
          data.storage_location,
          data.condition_notes ||
            'Recorded during evidence intake.',
          vaultMeta.fileName,
          vaultMeta.filePath,
          vaultMeta.fileSize,
          vaultMeta.sha256Hash,
          vaultMeta.mimeType,
          user.id,
          user.id,
          data.collected_at ?? null,
        ],
      );

      await db.query(
        `
          INSERT INTO chain_of_custody (
            id,
            evidence_id,
            case_id,
            transferred_from_id,
            transferred_to_id,
            action_type,
            reason,
            location,
            signature_hash
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          custodyId,
          id,
          data.case_id,
          user.id,
          user.id,
          'INITIAL_COLLECTION',
          'Evidence registered and secured in the investigation repository.',
          data.storage_location,
          signatureHash,
        ],
      );

      await db.query('COMMIT');
      transactionStarted = false;

      await logAuditEvent({
        userId: user.id,
        action: 'EVIDENCE_SEIZED_INTAKE',
        targetType: 'EVIDENCE',
        targetId: id,
        caseId: data.case_id,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          trackingNumber,
          sha256: vaultMeta.sha256Hash,
          category: data.category,
          collector: user.full_name,
          fileName: vaultMeta.fileName,
          fileSize: vaultMeta.fileSize,
          mimeType: vaultMeta.mimeType,
          vaultEncryption: 'AES-256-GCM',
          caseNumber:
            investigationCase.case_number,
          custodyHash: signatureHash,
        },
        status: 'SUCCESS',
      });

      const integrityAnchor = await createIntegrityAnchor({
        caseId: data.case_id,
        entityType: 'EVIDENCE',
        entityId: id,
        eventType: 'EVIDENCE_REGISTERED',
        sha256Hash: vaultMeta.sha256Hash,
        actorId: user.id,
        metadata: {
          custodyEventId: custodyId,
          category: data.category,
          fileSize: vaultMeta.fileSize,
          mimeType: vaultMeta.mimeType,
        },
      }).catch((error) => {
        console.error('[EVIDENCE] Integrity anchor failed after commit:', error);
        return null;
      });

      return res.status(201).json({
        success: true,
        evidenceId: id,
        trackingNumber,
        sha256Hash: vaultMeta.sha256Hash,
        status: 'VAULT_SECURED',
        integrityAnchor,
      });
    } catch (err: any) {
      console.error('[EVIDENCE] Creation failed:', err);

      if (transactionStarted) {
        await db.query('ROLLBACK').catch(() => {});
      }

      if (storedVaultPath) {
        await fs.promises
          .unlink(storedVaultPath)
          .catch(() => {});
      }

      await auditSecurityAlert(
        req,
        'EVIDENCE_INTAKE_ERROR',
        'CASE',
        data.case_id,
        data.case_id,
        {
          reason: 'EVIDENCE_INTAKE_TRANSACTION_ERROR',
          error:
            err?.message || 'Unknown error',
        },
      ).catch(() => {});

      return res.status(500).json({
        error: 'EVIDENCE_INTAKE_ERROR',
        message:
          'The evidence registration could not be completed.',
      });
    }
  },
);

/* =========================================================
   POST /api/evidence/:id/custody
   ========================================================= */

router.post(
  '/:id/custody',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const evidenceId = req.params.id;
    const user = req.user!;

    const parsed =
      CustodyTransferSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
    }

    const {
      transferred_to_id,
      action_type,
      reason,
      location,
    } = parsed.data;

    try {
      /*
       * IMPORTANT:
       * lead_io_id is selected from CASES here.
       * It is NOT read from evidence_items.
       */
      const evidenceResult = await db.query(
        `
          SELECT
            e.*,
            c.case_number,
            c.title AS case_title,
            c.jurisdiction AS case_jurisdiction,
            c.lead_io_id AS lead_io_id
          FROM evidence_items e
          JOIN cases c ON e.case_id = c.id
          WHERE e.id = $1
        `,
        [evidenceId],
      );

      if (evidenceResult.rows.length === 0) {
        return res.status(404).json({
          error: 'EVIDENCE_NOT_FOUND',
          message: 'Evidence item was not found.',
        });
      }

      const evidence =
        evidenceResult.rows[0] as any;

      const access =
        await evaluateAccessPolicy(
          user,
          'EVIDENCE_CUSTODY_TRANSFER',
          evidence.case_id,
          { evidenceId },
        );

      if (!access.allowed) {
        await auditDenied(
          req,
          'CHAIN_OF_CUSTODY_TRANSFER_DENIED',
          'EVIDENCE',
          evidenceId,
          evidence.case_id,
          {
            reason: access.reason,
            attemptedRecipient:
              transferred_to_id,
          },
        );

        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      if (
        user.role !== 'IO' &&
        user.role !== 'SUPERVISOR'
      ) {
        return res.status(403).json({
          error: 'ROLE_OPERATION_DENIED',
          message:
            'Only an authorized Investigation Officer or Supervisor can manage evidence custody.',
        });
      }

      const isSupervisor =
        user.role === 'SUPERVISOR';

      if (
        !isSupervisor &&
        evidence.current_custody_holder_id !==
          user.id
      ) {
        await auditDenied(
          req,
          'CHAIN_OF_CUSTODY_TRANSFER_DENIED',
          'EVIDENCE',
          evidenceId,
          evidence.case_id,
          {
            reason:
              'CALLER_IS_NOT_CURRENT_CUSTODIAN',
            currentCustodianId:
              evidence.current_custody_holder_id,
          },
        );

        return res.status(403).json({
          error: 'CUSTODY_CONTROL_DENIED',
          message:
            'Only the current custody holder or an authorized Supervisor can initiate this evidence transfer.',
        });
      }

      if (
        isSupervisor &&
        user.jurisdiction !==
          evidence.case_jurisdiction
      ) {
        return res.status(403).json({
          error: 'JURISDICTION_DENIED',
          message:
            'The Supervisor is not authorized for this investigation jurisdiction.',
        });
      }

      if (
        transferred_to_id ===
        evidence.current_custody_holder_id
      ) {
        return res.status(400).json({
          error: 'INVALID_CUSTODY_TRANSFER',
          message:
            'The receiving custodian must be different from the current custodian.',
        });
      }

      const recipientResult = await db.query(
        `
          SELECT
            id,
            username,
            full_name,
            role,
            jurisdiction,
            badge_number,
            is_active
          FROM users
          WHERE id = $1
        `,
        [transferred_to_id],
      );

      if (recipientResult.rows.length === 0) {
        return res.status(400).json({
          error: 'RECIPIENT_NOT_FOUND',
          message:
            'The selected receiving officer does not exist.',
        });
      }

      const recipient =
        recipientResult.rows[0] as any;

      if (recipient.is_active === false) {
        return res.status(400).json({
          error: 'RECIPIENT_INACTIVE',
          message:
            'Evidence cannot be transferred to an inactive user account.',
        });
      }

      if (
        recipient.role !== 'IO' &&
        recipient.role !== 'SUPERVISOR'
      ) {
        return res.status(403).json({
          error:
            'RECIPIENT_ROLE_NOT_AUTHORIZED',
          message:
            'Evidence custody can only be transferred to an authorized Investigation Officer or Supervisor.',
        });
      }

      let recipientAuthorized = false;

      if (
        recipient.role === 'SUPERVISOR' &&
        recipient.jurisdiction ===
          evidence.case_jurisdiction
      ) {
        recipientAuthorized = true;
      }

      if (recipient.role === 'IO') {
        const assignmentResult =
          await db.query(
            `
              SELECT
                assigned_role,
                can_read,
                can_write
              FROM case_assignments
              WHERE case_id = $1
                AND user_id = $2
              LIMIT 1
            `,
            [
              evidence.case_id,
              transferred_to_id,
            ],
          );

        const assignment =
          assignmentResult.rows[0] as
            | {
                assigned_role?: string;
                can_read?: boolean;
                can_write?: boolean;
              }
            | undefined;

        /*
         * Correct lead-IO check:
         * evidence.lead_io_id would be wrong.
         * The value was selected from cases as lead_io_id.
         */
        const isLeadIO =
          evidence.lead_io_id ===
          transferred_to_id;

        recipientAuthorized =
          isLeadIO ||
          (
            assignment !== undefined &&
            (
              assignment.can_read === true ||
              assignment.can_write === true
            )
          );
      }

      if (!recipientAuthorized) {
        await auditDenied(
          req,
          'CHAIN_OF_CUSTODY_TRANSFER_DENIED',
          'EVIDENCE',
          evidenceId,
          evidence.case_id,
          {
            reason:
              'RECIPIENT_NOT_AUTHORIZED_FOR_CASE',
            attemptedRecipient: {
              id: recipient.id,
              name: recipient.full_name,
              role: recipient.role,
              jurisdiction:
                recipient.jurisdiction,
            },
          },
        );

        return res.status(403).json({
          error: 'RECIPIENT_NOT_AUTHORIZED',
          message:
            'The receiving user is not authorized for this investigation.',
        });
      }

      await db.query('BEGIN');

      try {
        const lockedResult = await db.query(
          `
            SELECT
              current_custody_holder_id,
              sha256_hash
            FROM evidence_items
            WHERE id = $1
            FOR UPDATE
          `,
          [evidenceId],
        );

        if (lockedResult.rows.length === 0) {
          await db.query('ROLLBACK');

          return res.status(404).json({
            error: 'EVIDENCE_NOT_FOUND',
            message:
              'Evidence item was not found.',
          });
        }

        const lockedEvidence =
          lockedResult.rows[0] as any;

        const transferredFromId =
          lockedEvidence.current_custody_holder_id;

        if (
          transferredFromId ===
          transferred_to_id
        ) {
          await db.query('ROLLBACK');

          return res.status(400).json({
            error: 'INVALID_CUSTODY_TRANSFER',
            message:
              'The receiving custodian must be different from the current custodian.',
          });
        }

        if (
          user.role === 'IO' &&
          transferredFromId !== user.id
        ) {
          await db.query('ROLLBACK');

          return res.status(409).json({
            error: 'CUSTODY_STATE_CHANGED',
            message:
              'The evidence custody state changed before the transfer could be recorded. Please reload and try again.',
          });
        }

        const custodyId =
          `cust_${crypto.randomUUID().slice(0, 8)}`;

        const recordedAt =
          new Date().toISOString();

        const signatureHash =
          createCustodyHash(
            [
              custodyId,
              evidenceId,
              evidence.case_id,
              transferredFromId,
              transferred_to_id,
              action_type,
              reason,
              location,
              lockedEvidence.sha256_hash,
              recordedAt,
            ].join('|'),
          );

        await db.query(
          `
            INSERT INTO chain_of_custody (
              id,
              evidence_id,
              case_id,
              transferred_from_id,
              transferred_to_id,
              action_type,
              reason,
              location,
              signature_hash
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `,
          [
            custodyId,
            evidenceId,
            evidence.case_id,
            transferredFromId,
            transferred_to_id,
            action_type,
            reason,
            location,
            signatureHash,
          ],
        );

        await db.query(
          `
            UPDATE evidence_items
            SET
              current_custody_holder_id = $1,
              storage_location = $2
            WHERE id = $3
          `,
          [
            transferred_to_id,
            location,
            evidenceId,
          ],
        );

        await db.query('COMMIT');

        await logAuditEvent({
          userId: user.id,
          action:
            'CHAIN_OF_CUSTODY_TRANSFER',
          targetType: 'EVIDENCE',
          targetId: evidenceId,
          caseId: evidence.case_id,
          ipAddress:
            req.ip || '127.0.0.1',
          details: {
            custodyId,
            trackingNumber:
              evidence.tracking_number,
            from: {
              id: transferredFromId,
            },
            to: {
              id: recipient.id,
              name: recipient.full_name,
              badge: recipient.badge_number,
            },
            actionType: action_type,
            reason,
            location,
            evidenceSha256:
              lockedEvidence.sha256_hash,
            custodyIntegrityHash:
              signatureHash,
            recordedAt,
          },
          status: 'SUCCESS',
        });

        const integrityAnchor = await createIntegrityAnchor({
          caseId: evidence.case_id,
          entityType: 'CUSTODY_EVENT',
          entityId: custodyId,
          eventType: 'EVIDENCE_CUSTODY_TRANSFER',
          sha256Hash: signatureHash,
          actorId: user.id,
          metadata: {
            evidenceId,
            actionType: action_type,
            fromActorId: transferredFromId,
            toActorId: transferred_to_id,
          },
        }).catch((error) => {
          console.error('[EVIDENCE] Custody integrity anchor failed after commit:', error);
          return null;
        });

        return res.json({
          success: true,
          custodyId,
          signatureHash,
          integrityAnchor,
        });
      } catch (transactionError) {
        await db.query('ROLLBACK').catch(() => {});
        throw transactionError;
      }
    } catch (err: any) {
      console.error(
        '[EVIDENCE] Custody transfer failed:',
        err,
      );

      await auditSecurityAlert(
        req,
        'CHAIN_OF_CUSTODY_TRANSFER_ERROR',
        'EVIDENCE',
        evidenceId,
        'UNKNOWN',
        {
          reason:
            'CUSTODY_OPERATION_ERROR',
          error:
            err?.message || 'Unknown error',
        },
      ).catch(() => {});

      return res.status(500).json({
        error:
          'CUSTODY_OPERATION_ERROR',
        message:
          'The custody transfer could not be completed.',
      });
    }
  },
);

/* =========================================================
   POST /api/evidence/:id/verify-hash
   ========================================================= */

router.post(
  '/:id/verify-hash',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const evidenceId = req.params.id;

    try {
      const result = await db.query(
        `
          SELECT *
          FROM evidence_items
          WHERE id = $1
        `,
        [evidenceId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'EVIDENCE_NOT_FOUND',
          message:
            'Evidence item was not found.',
        });
      }

      const evidence =
        result.rows[0] as any;

      const access =
        await evaluateAccessPolicy(
          req.user!,
          'EVIDENCE_VIEW',
          evidence.case_id,
          { evidenceId },
        );

      if (!access.allowed) {
        await auditDenied(
          req,
          'EVIDENCE_HASH_VERIFICATION_DENIED',
          'EVIDENCE',
          evidenceId,
          evidence.case_id,
          { reason: access.reason },
        );

        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      const registeredHash =
        String(evidence.sha256_hash || '')
          .trim()
          .toLowerCase();

      if (
        !/^[a-f0-9]{64}$/.test(
          registeredHash,
        )
      ) {
        return res.status(500).json({
          error:
            'REGISTERED_HASH_INVALID',
          message:
            'This evidence item does not have a valid registered SHA-256 digest.',
        });
      }

      if (!evidence.file_path) {
        return res.status(400).json({
          error: 'NO_DIGITAL_PAYLOAD',
          message:
            'This evidence item does not have a digital payload that can be cryptographically re-verified.',
        });
      }

      const securePath =
        getVaultFilePath(
          evidence.file_path,
        );

      if (!securePath) {
        return res.status(404).json({
          error: 'FILE_NOT_FOUND',
          message:
            'The digital evidence payload could not be located in the secure vault.',
        });
      }

      const verification =
        await verifyVaultFileIntegrity(
          securePath,
          registeredHash,
        );

      if (verification.failure) {
        await auditSecurityAlert(
          req,
          'EVIDENCE_HASH_VERIFICATION_ERROR',
          'EVIDENCE',
          evidenceId,
          evidence.case_id,
          { reason: verification.failure },
        );

        return res.status(409).json({
          error: 'VAULT_VERIFICATION_ERROR',
          message:
            'The encrypted evidence object could not be authenticated and verified.',
        });
      }

      const calculatedHash =
        verification.calculatedHash
          .trim()
          .toLowerCase();

      const verified =
        verification.verified;

      await db.query(
        `
          UPDATE evidence_items
          SET is_tampered = $1
          WHERE id = $2
        `,
        [!verified, evidenceId],
      );

      await logAuditEvent({
        userId: req.user!.id,
        action:
          'EVIDENCE_HASH_VERIFICATION',
        targetType: 'EVIDENCE',
        targetId: evidenceId,
        caseId: evidence.case_id,
        ipAddress:
          req.ip || '127.0.0.1',
        details: {
          trackingNumber:
            evidence.tracking_number,
          registeredSha256:
            registeredHash,
          calculatedSha256:
            calculatedHash,
          hashMatch: verified,
          result: verified
            ? 'INTEGRITY_CONFIRMED'
            : 'INTEGRITY_VIOLATION',
          fileSize: evidence.file_size,
          vaultAuthentication:
            'AES-256-GCM',
        },
        status: verified
          ? 'SUCCESS'
          : 'SECURITY_ALERT',
      });

      if (!verified) {
        return res.json({
          verified: false,
          sha256Hash: registeredHash,
          calculatedSha256:
            calculatedHash,
          status:
            'INTEGRITY_VIOLATION',
          message:
            'The current digital evidence file does not match its registered SHA-256 digest. A possible unauthorized modification has been detected.',
        });
      }

      return res.json({
        verified: true,
        sha256Hash: registeredHash,
        calculatedSha256:
          calculatedHash,
        status:
          'CRYPTOGRAPHIC_MATCH',
        message:
          'The current digital evidence file matches its registered SHA-256 digest.',
      });
    } catch (err: any) {
      console.error(
        '[EVIDENCE] Hash verification failed:',
        err,
      );

      return res.status(500).json({
        error:
          'HASH_VERIFICATION_ERROR',
        message:
          'The evidence integrity verification could not be completed.',
      });
    }
  },
);

/* =========================================================
   GET /api/evidence/:id/download
   ========================================================= */

router.get(
  '/:id/download',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const evidenceId = req.params.id;

    try {
      const result = await db.query(
        `
          SELECT *
          FROM evidence_items
          WHERE id = $1
        `,
        [evidenceId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'EVIDENCE_NOT_FOUND',
          message:
            'Evidence item was not found.',
        });
      }

      const evidence =
        result.rows[0] as any;

      const access =
        await evaluateAccessPolicy(
          req.user!,
          'EVIDENCE_VIEW',
          evidence.case_id,
          { evidenceId },
        );

      if (!access.allowed) {
        await auditDenied(
          req,
          'EVIDENCE_DOWNLOAD_DENIED',
          'EVIDENCE',
          evidenceId,
          evidence.case_id,
          {
            reason: access.reason,
            fileName:
              evidence.file_name,
          },
        );

        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      if (!evidence.file_path) {
        return res.status(404).json({
          error: 'NO_FILE_ATTACHED',
          message:
            'This evidence item does not have a digital payload attached.',
        });
      }

      const securePath =
        getVaultFilePath(
          evidence.file_path,
        );

      if (!securePath) {
        return res.status(404).json({
          error: 'FILE_NOT_FOUND',
          message:
            'The requested digital evidence could not be located in the secure vault.',
        });
      }

      const registeredHash =
        String(evidence.sha256_hash || '')
          .trim()
          .toLowerCase();

      if (
        !/^[a-f0-9]{64}$/.test(
          registeredHash,
        )
      ) {
        return res.status(409).json({
          error:
            'INTEGRITY_UNVERIFIED',
          message:
            'The evidence cannot be released because its registered integrity digest is invalid.',
        });
      }

      /*
       * Never release the file before cryptographic verification.
       */
      const verification =
        await verifyVaultFileIntegrity(
          securePath,
          registeredHash,
        );

      if (verification.failure) {
        await auditSecurityAlert(
          req,
          'EVIDENCE_DOWNLOAD_BLOCKED_VAULT_ERROR',
          'EVIDENCE',
          evidenceId,
          evidence.case_id,
          { reason: verification.failure },
        );

        return res.status(409).json({
          error: 'VAULT_VERIFICATION_ERROR',
          message:
            'The evidence could not be authenticated from the secure vault and was not released.',
        });
      }

      const calculatedHash =
        verification.calculatedHash
          .trim()
          .toLowerCase();

      if (!verification.verified) {
        await db.query(
          `
            UPDATE evidence_items
            SET is_tampered = TRUE
            WHERE id = $1
          `,
          [evidenceId],
        );

        await auditSecurityAlert(
          req,
          'EVIDENCE_DOWNLOAD_BLOCKED_INTEGRITY_FAILURE',
          'EVIDENCE',
          evidenceId,
          evidence.case_id,
          {
            reason:
              'PLAINTEXT_SHA256_MISMATCH',
            registeredSha256:
              registeredHash,
            calculatedSha256:
              calculatedHash,
          },
        );

        return res.status(409).json({
          error:
            'INTEGRITY_VIOLATION',
          message:
            'The evidence file failed integrity verification and was not released.',
        });
      }

      const plaintextBytes = verification.plaintext!;

      await db.query(
        `
          UPDATE evidence_items
          SET is_tampered = FALSE
          WHERE id = $1
        `,
        [evidenceId],
      );

      await logAuditEvent({
        userId: req.user!.id,
        action: 'EVIDENCE_VIEW',
        targetType: 'EVIDENCE',
        targetId: evidenceId,
        caseId: evidence.case_id,
        ipAddress:
          req.ip || '127.0.0.1',
        details: {
          action:
            'DOWNLOAD_VAULT_FILE',
          fileName:
            evidence.file_name,
          sha256:
            registeredHash,
          calculatedSha256:
            calculatedHash,
          integrityVerified: true,
          vaultEncryption:
            'AES-256-GCM',
        },
        status: 'SUCCESS',
      });

      res.setHeader(
        'Content-Type',
        evidence.mime_type ||
          'application/octet-stream',
      );

      res.setHeader(
        'Content-Length',
        plaintextBytes.length.toString(),
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFileName(
          evidence.file_name,
        )}"`,
      );

      res.setHeader(
        'X-Content-Type-Options',
        'nosniff',
      );

      return res.send(
        plaintextBytes,
      );
    } catch (err: any) {
      console.error(
        '[EVIDENCE] Download failed:',
        err,
      );

      return res.status(500).json({
        error:
          'EVIDENCE_DOWNLOAD_ERROR',
        message:
          'The evidence file could not be released.',
      });
    }
  },
);

export default router;
