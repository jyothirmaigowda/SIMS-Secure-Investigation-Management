import { Router, Response } from 'express';
import { db } from '../db.ts';
import { verifyAuditChain, logAuditEvent } from '../audit.ts';
import {
  requireAuth,
  requireSecurityCheck,
  AuthenticatedRequest,
} from '../auth.ts';

const router = Router();

/**
 * GET /api/audit
 *
 * Returns the audit ledger.
 * Access is controlled by AUDIT_VIEW in accessControl.ts.
 *
 * Optional:
 *   ?caseId=<case id>
 *   ?limit=50
 */
router.get(
  '/',
  requireAuth,
  requireSecurityCheck('AUDIT_VIEW'),
  async (req: AuthenticatedRequest, res: Response) => {
    const caseId =
      typeof req.query.caseId === 'string'
        ? req.query.caseId.trim()
        : '';

    const requestedLimit =
      typeof req.query.limit === 'string'
        ? Number.parseInt(req.query.limit, 10)
        : 50;

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    try {
      /*
       * If a case is supplied, explicitly verify that the authenticated
       * user can read that case. This prevents a user with general
       * audit visibility from using the endpoint as a case-data bypass.
       */
      if (caseId) {
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

        /*
         * requireSecurityCheck() already handles case-scoped authorization
         * when the case ID is available in the request. We also perform the
         * explicit check here because this endpoint uses a query parameter.
         */
        const { evaluateAccessPolicy } = await import('../accessControl.ts');

        const access = await evaluateAccessPolicy(
          req.user!,
          'CASE_READ',
          caseId
        );

        if (!access.allowed) {
          await logAuditEvent({
            userId: req.user!.id,
            action: 'AUDIT_CASE_ACCESS_DENIED',
            targetType: 'CASE',
            targetId: caseId,
            caseId,
            ipAddress: req.ip || '127.0.0.1',
            details: {
              reason: access.reason,
              role: req.user!.role,
            },
            status: 'SECURITY_ALERT',
          });

          return res.status(403).json({
            error: 'FORBIDDEN',
            message: 'You are not authorized to view this case audit trail',
          });
        }
      }

      let query = `
        SELECT
          a.*,
          u.full_name AS user_name,
          u.badge_number AS user_badge,
          u.role AS user_role
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
      `;

      const params: any[] = [];

      if (caseId) {
        query += ` WHERE a.case_id = $1`;
        params.push(caseId);
      }

      query += `
        ORDER BY a.sequence_num DESC
        LIMIT $${params.length + 1}
      `;

      params.push(limit);

      const logsResult = await db.query(query, params);

      return res.json({
        logs: logsResult.rows,
        count: logsResult.rows.length,
        limit,
        caseId: caseId || null,
      });
    } catch (err: any) {
      console.error('Audit retrieval failed:', err);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to retrieve audit records',
      });
    }
  }
);

/**
 * GET /api/audit/verify
 *
 * Cryptographically verifies the audit hash chain.
 *
 * Only users authorized for AUDIT_VERIFY may access this endpoint.
 * The verification attempt itself is recorded in the audit ledger.
 */
router.get(
  '/verify',
  requireAuth,
  requireSecurityCheck('AUDIT_VERIFY'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await verifyAuditChain();

      /*
       * Record the verification result.
       *
       * AUDIT_VERIFY is restricted to ADMIN by accessControl.ts.
       */
      await logAuditEvent({
        userId: req.user!.id,
        action: 'AUDIT_INTEGRITY_VERIFICATION',
        targetType: 'SYSTEM_AUDIT_LOG',
        ipAddress: req.ip || '127.0.0.1',
        details: {
          verified: result.verified,
          totalRecords: result.totalRecords,
          latestHash: result.latestHash,
          reason: result.reason,
        },
        status: result.verified ? 'SUCCESS' : 'SECURITY_ALERT',
      });

      return res.json({
        verified: result.verified,
        totalRecords: result.totalRecords,
        reason: result.reason,
        latestHash: result.latestHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Audit integrity verification failed:', err);

      return res.status(500).json({
        error: 'AUDIT_VERIFICATION_ERROR',
        message: 'Unable to verify the audit ledger',
      });
    }
  }
);

export default router;