import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';

import { db } from '../db.ts';
import { logAuditEvent } from '../audit.ts';
import {
  requireAuth,
  requireSecurityCheck,
  AuthenticatedRequest,
  evaluateAccessPolicy,
} from '../auth.ts';

const router = Router();

// =========================================================
// VALIDATION
// =========================================================

const ReportSchema = z.object({
  case_id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(300),
  report_type: z.enum([
    'INITIAL',
    'SUPPLEMENTAL',
    'CLOSING',
  ]),
  content: z.string().trim().min(1).max(50000),
});

const ReviewReportSchema = z.object({
  decision: z.enum([
    'APPROVED',
    'REJECTED',
    'CHANGES_REQUIRED',
  ]),
  rejection_reason: z
    .string()
    .trim()
    .max(10000)
    .optional(),
});

// =========================================================
// GET REPORTS FOR CASE
// =========================================================

/**
 * GET /api/reports?caseId=<case-id>
 *
 * Returns reports belonging to an authorized case.
 */
router.get(
  '/',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    const caseId =
      typeof req.query.caseId === 'string'
        ? req.query.caseId.trim()
        : '';

    if (!caseId) {
      return res.status(400).json({
        error: 'MISSING_CASE_ID',
        message: 'A case ID is required.',
      });
    }

    try {
      const access = await evaluateAccessPolicy(
        req.user!,
        'CASE_READ',
        caseId
      );

      if (!access.allowed) {
        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      const caseResult = await db.query(
        `
          SELECT
            id,
            case_number,
            title,
            status,
            jurisdiction
          FROM cases
          WHERE id = $1
          LIMIT 1
        `,
        [caseId]
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message: 'The requested case does not exist.',
        });
      }

      const reportsResult = await db.query(
        `
          SELECT
            r.*,
            u.full_name AS author_name,
            u.badge_number AS author_badge,
            u.role AS author_role,
            s.full_name AS supervisor_name
          FROM case_reports r
          INNER JOIN users u
            ON r.author_id = u.id
          LEFT JOIN users s
            ON r.supervisor_id = s.id
          WHERE r.case_id = $1
          ORDER BY r.created_at DESC, r.id DESC
        `,
        [caseId]
      );

      return res.json({
        caseId,
        reports: reportsResult.rows,
        count: reportsResult.rows.length,
      });
    } catch (error: unknown) {
      console.error(
        '[REPORTS] Failed to retrieve reports:',
        error
      );

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to retrieve case reports.',
      });
    }
  }
);

// =========================================================
// CREATE REPORT
// =========================================================

/**
 * POST /api/reports
 *
 * Creates a draft report and its first version.
 *
 * Only an IO assigned to the case should create
 * investigation reports.
 */
router.post(
  '/',
  requireAuth,
  requireSecurityCheck('CASE_UPDATE'),
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    const parseResult =
      ReportSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
    }

    const {
      case_id: caseId,
      title,
      report_type: reportType,
      content,
    } = parseResult.data;

    const user = req.user!;

    // -------------------------------------------------------
    // Professional role boundary.
    // -------------------------------------------------------

    if (user.role !== 'IO') {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        message:
          'Only an Investigating Officer can create investigation reports.',
      });
    }

    const reportId =
      `rep_${crypto.randomUUID()}`;

    const versionId =
      `repv_${crypto.randomUUID()}`;

    try {
      // -----------------------------------------------------
      // Verify case exists.
      // -----------------------------------------------------

      const caseResult = await db.query(
        `
          SELECT
            id,
            case_number,
            title,
            status,
            jurisdiction
          FROM cases
          WHERE id = $1
          LIMIT 1
        `,
        [caseId]
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message: 'The requested case does not exist.',
        });
      }

      // -----------------------------------------------------
      // Explicit authorization check.
      // -----------------------------------------------------

      const access = await evaluateAccessPolicy(
        user,
        'CASE_UPDATE',
        caseId
      );

      if (!access.allowed) {
        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      // -----------------------------------------------------
      // Transaction: report + first version.
      // -----------------------------------------------------

      await db.query('BEGIN');

      try {
        const reportResult = await db.query(
          `
            INSERT INTO case_reports (
              id,
              case_id,
              title,
              report_type,
              content,
              status,
              author_id
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              'DRAFT',
              $6
            )
            RETURNING *
          `,
          [
            reportId,
            caseId,
            title,
            reportType,
            content,
            user.id,
          ]
        );

        await db.query(
          `
            INSERT INTO report_versions (
              id,
              report_id,
              content,
              author_id
            )
            VALUES (
              $1,
              $2,
              $3,
              $4
            )
          `,
          [
            versionId,
            reportId,
            content,
            user.id,
          ]
        );

        await db.query('COMMIT');

        await logAuditEvent({
          userId: user.id,
          action: 'REPORT_CREATED',
          targetType: 'REPORT',
          targetId: reportId,
          caseId,
          ipAddress:
            req.ip || '127.0.0.1',
          details: {
            title,
            reportType,
            status: 'DRAFT',
            versionId,
          },
          status: 'SUCCESS',
        });

        return res.status(201).json({
          success: true,
          reportId,
          versionId,
          report: reportResult.rows[0],
        });
      } catch (transactionError) {
        await db.query('ROLLBACK');
        throw transactionError;
      }
    } catch (error: unknown) {
      console.error(
        '[REPORTS] Failed to create report:',
        error
      );

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to create the investigation report.',
      });
    }
  }
);

// =========================================================
// SUBMIT REPORT
// =========================================================

/**
 * PATCH /api/reports/:id/submit
 *
 * IO submits a draft report for review.
 */
router.patch(
  '/:id/submit',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    const reportId = req.params.id;
    const user = req.user!;

    if (user.role !== 'IO') {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        message:
          'Only an Investigating Officer can submit an investigation report.',
      });
    }

    try {
      const reportLookup = await db.query(
        `
          SELECT
            r.*,
            c.jurisdiction,
            c.case_number
          FROM case_reports r
          INNER JOIN cases c
            ON r.case_id = c.id
          WHERE r.id = $1
          LIMIT 1
        `,
        [reportId]
      );

      if (reportLookup.rows.length === 0) {
        return res.status(404).json({
          error: 'REPORT_NOT_FOUND',
          message: 'The requested report does not exist.',
        });
      }

      const report = reportLookup.rows[0] as any;

      const access = await evaluateAccessPolicy(
        user,
        'CASE_UPDATE',
        report.case_id
      );

      if (!access.allowed) {
        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      // Prevent repeated submission.
      if (report.status !== 'DRAFT') {
        return res.status(409).json({
          error: 'INVALID_REPORT_STATE',
          message:
            `Only DRAFT reports can be submitted. Current status: ${report.status}.`,
        });
      }

      const updatedResult = await db.query(
        `
          UPDATE case_reports
          SET
            status = 'SUBMITTED',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [reportId]
      );

      const updatedReport =
        updatedResult.rows[0] as any;

      // -----------------------------------------------------
      // Notify supervisors responsible for the jurisdiction.
      // -----------------------------------------------------

      const supervisors = await db.query(
        `
          SELECT id
          FROM users
          WHERE role = 'SUPERVISOR'
            AND jurisdiction = $1
        `,
        [report.jurisdiction]
      );

       for (const supervisor of supervisors.rows as Array<{ id: string }>) {
        await db.query(
          `
            INSERT INTO notifications (
              id,
              user_id,
              type,
              title,
              content,
              case_id
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6
            )
          `,
          [
            `notif_${crypto.randomUUID()}`,
            supervisor.id,
            'INFO',
            'Report Submitted for Review',
            `A ${updatedReport.report_type} report requires your review.`,
            updatedReport.case_id,
          ]
        );
      }

      await logAuditEvent({
        userId: user.id,
        action: 'REPORT_SUBMITTED',
        targetType: 'REPORT',
        targetId: reportId,
        caseId: report.case_id,
        ipAddress:
          req.ip || '127.0.0.1',
        details: {
          reportType: updatedReport.report_type,
          status: 'SUBMITTED',
        },
        status: 'SUCCESS',
      });

      return res.json({
        success: true,
        report: updatedReport,
      });
    } catch (error: unknown) {
      console.error(
        '[REPORTS] Failed to submit report:',
        error
      );

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to submit the report.',
      });
    }
  }
);

// =========================================================
// REVIEW REPORT
// =========================================================

/**
 * PATCH /api/reports/:id/review
 *
 * Supervisor reviews a submitted report.
 */
router.patch(
  '/:id/review',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    const reportId = req.params.id;
    const user = req.user!;

    if (user.role !== 'SUPERVISOR') {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        message:
          'Only a supervising officer can review an investigation report.',
      });
    }

    const parseResult =
      ReviewReportSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
    }

    const {
      decision,
      rejection_reason: rejectionReason,
    } = parseResult.data;

    if (
      decision === 'REJECTED' &&
      !rejectionReason
    ) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message:
          'A rejection reason is required when rejecting a report.',
      });
    }

    try {
      const reportLookup = await db.query(
        `
          SELECT
            r.*,
            c.jurisdiction,
            c.case_number
          FROM case_reports r
          INNER JOIN cases c
            ON r.case_id = c.id
          WHERE r.id = $1
          LIMIT 1
        `,
        [reportId]
      );

      if (reportLookup.rows.length === 0) {
        return res.status(404).json({
          error: 'REPORT_NOT_FOUND',
          message: 'The requested report does not exist.',
        });
      }

      const report =
        reportLookup.rows[0] as any;

      const access = await evaluateAccessPolicy(
        user,
        'REVIEW_SUBMIT',
        report.case_id
      );

      if (!access.allowed) {
        return res.status(403).json({
          error: 'AUTHORIZATION_DENIED',
          message: access.reason,
        });
      }

      if (report.status !== 'SUBMITTED') {
        return res.status(409).json({
          error: 'INVALID_REPORT_STATE',
          message:
            `Only SUBMITTED reports can be reviewed. Current status: ${report.status}.`,
        });
      }

      const updatedResult = await db.query(
        `
          UPDATE case_reports
          SET
            status = $1,
            rejection_reason = $2,
            supervisor_id = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          RETURNING *
        `,
        [
          decision,
          rejectionReason || null,
          user.id,
          reportId,
        ]
      );

      const updatedReport =
        updatedResult.rows[0] as any;

      // -----------------------------------------------------
      // Notify report author.
      // -----------------------------------------------------

      await db.query(
        `
          INSERT INTO notifications (
            id,
            user_id,
            type,
            title,
            content,
            case_id
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
        `,
        [
          `notif_${crypto.randomUUID()}`,
          report.author_id,
          decision === 'REJECTED'
            ? 'WARNING'
            : 'INFO',
          `Report ${decision}`,
          rejectionReason
            ? `Your ${report.report_type} report was ${decision.toLowerCase()}. Reason: ${rejectionReason}`
            : `Your ${report.report_type} report was ${decision.toLowerCase()}.`,
          report.case_id,
        ]
      );

      await logAuditEvent({
        userId: user.id,
        action: 'REPORT_REVIEWED',
        targetType: 'REPORT',
        targetId: reportId,
        caseId: report.case_id,
        ipAddress:
          req.ip || '127.0.0.1',
        details: {
          reportType: report.report_type,
          decision,
          rejectionReasonProvided:
            Boolean(rejectionReason),
        },
        status: 'SUCCESS',
      });

      return res.json({
        success: true,
        report: updatedReport,
      });
    } catch (error: unknown) {
      console.error(
        '[REPORTS] Failed to review report:',
        error
      );

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to review the report.',
      });
    }
  }
);

export default router;