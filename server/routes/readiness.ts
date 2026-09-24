import { Router, Response } from 'express';
import { db } from '../db.ts';
import {
  requireAuth,
  requireSecurityCheck,
  AuthenticatedRequest,
} from '../auth.ts';
import { evaluateAccessPolicy } from '../accessControl.ts';
import crypto from 'crypto';
import { z } from 'zod';
import { logAuditEvent } from '../audit.ts';

const router = Router();

const CertSchema = z.object({
  case_id: z.string().min(1),
  certifier_name: z.string().trim().min(1).max(200),
  certifier_title: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(10000),
});

/**
 * GET /api/cases/:id/readiness
 *
 * Calculates investigation readiness from persisted case data.
 * This is a decision-support/readiness view and does not itself
 * make any legal-admissibility determination.
 */
router.get(
  '/:id/readiness',
  requireAuth,
  requireSecurityCheck('CASE_READ'),
  async (req: AuthenticatedRequest, res: Response) => {
    const caseId = req.params.id;

    try {
      const caseResult = await db.query(
        `SELECT
           id,
           case_number,
           status,
           jurisdiction
         FROM cases
         WHERE id = $1`,
        [caseId]
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message: 'Case not found',
        });
      }

      const docs = await db.query(
        `SELECT doc_type
         FROM case_documents
         WHERE case_id = $1`,
        [caseId]
      );

      const docTypes = docs.rows.map((row: any) => row.doc_type);

      const hasWarrant =
        docTypes.includes('SEARCH_WARRANT') ||
        docTypes.includes('ARREST_WARRANT');

      const hasIndictment = docTypes.includes('LEGAL_INDICTMENT_MEMO');

      const evidenceResult = await db.query(
        `SELECT id, is_tampered
         FROM evidence_items
         WHERE case_id = $1`,
        [caseId]
      );

      const evidenceIntegrity =
        evidenceResult.rows.length > 0 &&
        evidenceResult.rows.every(
          (e: any) => e.is_tampered === false
        );

      const custodyResult = await db.query(
        `SELECT evidence_id
         FROM chain_of_custody
         WHERE case_id = $1`,
        [caseId]
      );

      const custodyEvidenceIds = new Set(
        custodyResult.rows.map((row: any) => row.evidence_id)
      );

      const custodyCompleteness =
        evidenceResult.rows.length > 0 &&
        evidenceResult.rows.every((e: any) =>
          custodyEvidenceIds.has(e.id)
        );

      const diaryResult = await db.query(
        `SELECT COUNT(*) AS count
         FROM investigation_diary
         WHERE case_id = $1`,
        [caseId]
      );

      const hasDiary =
        Number.parseInt(
          String((diaryResult.rows[0] as any)?.count ?? '0'),
          10
        ) > 0;

      const reportsResult = await db.query(
        `SELECT status
         FROM case_reports
         WHERE case_id = $1`,
        [caseId]
      );

      const hasApprovedReport = reportsResult.rows.some(
        (row: any) => row.status === 'APPROVED'
      );

      const caseRow = caseResult.rows[0] as {
        status?: string;
      };

      const hasLegalReview =
        caseRow.status === 'READY_FOR_COURT' ||
        caseRow.status === 'LEGAL_REVIEW';

      const certsResult = await db.query(
        `SELECT id
         FROM certificates
         WHERE case_id = $1`,
        [caseId]
      );

      const hasCertificates = certsResult.rows.length > 0;

      const readinessChecks = [
        {
          key: 'requiredDocuments',
          label: 'Required investigation/legal documents',
          compliant: hasWarrant && hasIndictment,
        },
        {
          key: 'evidenceIntegrity',
          label: 'Evidence integrity',
          compliant: evidenceIntegrity,
        },
        {
          key: 'custodyCompleteness',
          label: 'Chain-of-custody completeness',
          compliant: custodyCompleteness,
        },
        {
          key: 'investigationDiary',
          label: 'Investigation diary',
          compliant: hasDiary,
        },
        {
          key: 'reportStatus',
          label: 'Approved investigation report',
          compliant: hasApprovedReport,
        },
        {
          key: 'legalReview',
          label: 'Legal/review stage',
          compliant: hasLegalReview,
        },
        {
          key: 'requiredCertificates',
          label: 'Required certificates',
          compliant: hasCertificates,
        },
      ];

      const completedChecks = readinessChecks.filter(
        (check) => check.compliant
      ).length;

      const totalChecks = readinessChecks.length;

      return res.json({
        caseId,
        readinessChecks,
        completedChecks,
        totalChecks,
        readinessScore:
          totalChecks > 0
            ? Math.round((completedChecks / totalChecks) * 100)
            : 0,
        ready:
          totalChecks > 0 &&
          completedChecks === totalChecks,

        // Keep the existing response fields for frontend compatibility.
        requiredDocuments: hasWarrant && hasIndictment,
        evidenceIntegrity,
        custodyCompleteness,
        investigationDiary: hasDiary,
        reportStatus: hasApprovedReport,
        legalReview: hasLegalReview,
        requiredCertificates: hasCertificates,
      });
    } catch (err: any) {
      console.error('Readiness calculation failed:', err);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to calculate case readiness',
      });
    }
  }
);

/**
 * GET /api/cases/:id/certificates
 *
 * Certificates are visible only to users who can read the case.
 */
router.get(
  '/:id/certificates',
  requireAuth,
  requireSecurityCheck('CASE_READ'),
  async (req: AuthenticatedRequest, res: Response) => {
    const caseId = req.params.id;

    try {
      const certs = await db.query(
        `SELECT *
         FROM certificates
         WHERE case_id = $1
         ORDER BY created_at DESC`,
        [caseId]
      );

      return res.json({
        caseId,
        certificates: certs.rows,
        count: certs.rows.length,
      });
    } catch (err: any) {
      console.error('Certificate retrieval failed:', err);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to retrieve certificates',
      });
    }
  }
);

/**
 * POST /api/cases/:id/certificates
 *
 * Certificate generation is a controlled legal/supervisory action.
 * IO users cannot generate certificates through this endpoint.
 */
router.post(
  '/:id/certificates',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const caseId = req.params.id;
    const user = req.user!;

    // Certificates are restricted to Legal and Supervisor roles.
    if (user.role !== 'LEGAL' && user.role !== 'SUPERVISOR') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message:
          'Only Legal or Supervisory users can generate case certificates',
      });
    }

    const access = await evaluateAccessPolicy(
      user,
      'DOCUMENT_SIGN',
      caseId
    );

    if (!access.allowed) {
      await logAuditEvent({
        userId: user.id,
        action: 'CERTIFICATE_GENERATION_DENIED',
        targetType: 'CASE',
        targetId: caseId,
        caseId,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          reason: access.reason,
          role: user.role,
        },
        status: 'SECURITY_ALERT',
      });

      return res.status(403).json({
        error: 'FORBIDDEN',
        message: access.reason || 'Certificate generation not authorized',
      });
    }

    const parseResult = CertSchema.safeParse({
      ...req.body,
      case_id: caseId,
    });

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.format(),
      });
    }

    const {
      certifier_name,
      certifier_title,
      statement,
    } = parseResult.data;

    const certificateId =
      'cert_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

    try {
      const caseResult = await db.query(
        `SELECT id
         FROM cases
         WHERE id = $1`,
        [caseId]
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message: 'Case not found',
        });
      }

      await db.query('BEGIN');

      try {
        await db.query(
          `INSERT INTO certificates
           (
             id,
             case_id,
             author_id,
             certifier_name,
             certifier_title,
             statement,
             system_version
           )
           VALUES
           (
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7
           )`,
          [
            certificateId,
            caseId,
            user.id,
            certifier_name,
            certifier_title,
            statement,
            'SIMS-v5.0.0',
          ]
        );

        await db.query('COMMIT');
      } catch (transactionError) {
        await db.query('ROLLBACK');
        throw transactionError;
      }

      await logAuditEvent({
        userId: user.id,
        action: 'CERTIFICATE_GENERATED',
        targetType: 'CASE',
        targetId: caseId,
        caseId,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          certificateId,
          certifier: certifier_name,
          title: certifier_title,
          role: user.role,
        },
        status: 'SUCCESS',
      });

      return res.status(201).json({
        success: true,
        certificateId,
        message: 'Certificate record created successfully',
      });
    } catch (err: any) {
      console.error('Certificate generation failed:', err);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to create certificate',
      });
    }
  }
);

export default router;