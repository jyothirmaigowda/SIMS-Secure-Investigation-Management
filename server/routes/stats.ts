import { Router, Response } from 'express';
import { db } from '../db.ts';
import {
  requireAuth,
  AuthenticatedRequest,
} from '../auth.ts';

const router = Router();

/**
 * Build a reusable case-visibility predicate.
 *
 * ADMIN:
 *   Can see all cases.
 *
 * SUPERVISOR:
 *   Can see cases in their jurisdiction.
 *
 * IO:
 *   Can see assigned cases and cases where they are the lead IO.
 *
 * LEGAL:
 *   Can see assigned cases only.
 */
function getCaseVisibility(
  user: AuthenticatedRequest['user'],
  alias = 'c'
) {
  if (!user) {
    return {
      sql: '1 = 0',
      params: [],
    };
  }

  if (user.role === 'ADMIN') {
    return {
      sql: '1 = 1',
      params: [],
    };
  }

  if (user.role === 'SUPERVISOR') {
    return {
      sql: `${alias}.jurisdiction = $1`,
      params: [user.jurisdiction],
    };
  }

  if (user.role === 'IO') {
    return {
      sql: `(
        ${alias}.lead_io_id = $1
        OR EXISTS (
          SELECT 1
          FROM case_assignments ca
          WHERE ca.case_id = ${alias}.id
          AND ca.user_id = $1
        )
      )`,
      params: [user.id],
    };
  }

  if (user.role === 'LEGAL') {
    return {
      sql: `EXISTS (
        SELECT 1
        FROM case_assignments ca
        WHERE ca.case_id = ${alias}.id
        AND ca.user_id = $1
      )`,
      params: [user.id],
    };
  }

  return {
    sql: '1 = 0',
    params: [],
  };
}

/**
 * GET /api/stats/dashboard
 */
router.get(
  '/dashboard',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    try {
      const visibility = getCaseVisibility(user, 'c');

      const totalCasesRes = await db.query(
        `SELECT COUNT(*) AS count
         FROM cases c
         WHERE ${visibility.sql}`,
        visibility.params
      );

      const activeCasesRes = await db.query(
        `SELECT COUNT(*) AS count
         FROM cases c
         WHERE c.status NOT IN ('CLOSED', 'ARCHIVED')
         AND ${visibility.sql}`,
        visibility.params
      );

      const pendingSupReviewRes = await db.query(
        `SELECT COUNT(*) AS count
         FROM cases c
         WHERE c.status = 'SUPERVISOR_REVIEW'
         AND ${visibility.sql}`,
        visibility.params
      );

      const pendingLegalReviewRes = await db.query(
        `SELECT COUNT(*) AS count
         FROM cases c
         WHERE c.status = 'LEGAL_REVIEW'
         AND ${visibility.sql}`,
        visibility.params
      );

      const totalEvidenceRes = await db.query(
        `SELECT COUNT(*) AS count
         FROM evidence_items e
         JOIN cases c ON c.id = e.case_id
         WHERE ${visibility.sql}`,
        visibility.params
      );

      const totalDocsRes = await db.query(
        `SELECT COUNT(*) AS count
         FROM case_documents d
         JOIN cases c ON c.id = d.case_id
         WHERE ${visibility.sql}`,
        visibility.params
      );

      const securityAlertsRes = await db.query(
        `SELECT COUNT(*) AS count
         FROM audit_logs a
         LEFT JOIN cases c ON c.id = a.case_id
         WHERE a.status IN ('DENIED', 'SECURITY_ALERT')
         AND (
           (
             a.case_id IS NOT NULL
             AND ${visibility.sql}
           )
           OR a.user_id = $${visibility.params.length + 1}
         )`,
        [
          ...visibility.params,
          user.id,
        ]
      );

      const recentCasesRes = await db.query(
        `SELECT
           c.*,
           u.full_name AS lead_io_name
         FROM cases c
         LEFT JOIN users u ON c.lead_io_id = u.id
         WHERE ${visibility.sql}
         ORDER BY c.created_at DESC
         LIMIT 5`,
        visibility.params
      );

      const recentAlertsRes = await db.query(
        `SELECT
           a.*,
           u.full_name AS user_name
         FROM audit_logs a
         LEFT JOIN users u ON a.user_id = u.id
         LEFT JOIN cases c ON c.id = a.case_id
         WHERE a.status IN ('DENIED', 'SECURITY_ALERT')
         AND (
           (
             a.case_id IS NOT NULL
             AND ${visibility.sql}
           )
           OR a.user_id = $${visibility.params.length + 1}
         )
         ORDER BY a.sequence_num DESC
         LIMIT 5`,
        [
          ...visibility.params,
          user.id,
        ]
      );

      const toNumber = (value: unknown) =>
        Number.parseInt(String(value ?? '0'), 10) || 0;

      return res.json({
        metrics: {
          totalCases: toNumber(
            (totalCasesRes.rows[0] as any)?.count
          ),
          activeCases: toNumber(
            (activeCasesRes.rows[0] as any)?.count
          ),
          pendingSupervisorReview: toNumber(
            (pendingSupReviewRes.rows[0] as any)?.count
          ),
          pendingLegalReview: toNumber(
            (pendingLegalReviewRes.rows[0] as any)?.count
          ),
          totalEvidence: toNumber(
            (totalEvidenceRes.rows[0] as any)?.count
          ),
          totalDocuments: toNumber(
            (totalDocsRes.rows[0] as any)?.count
          ),
          securityAlerts: toNumber(
            (securityAlertsRes.rows[0] as any)?.count
          ),
        },
        recentCases: recentCasesRes.rows,
        recentAlerts: recentAlertsRes.rows,
        currentUser: user,
      });
    } catch (err: any) {
      console.error('[STATS] Dashboard query failed:', err);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to load dashboard statistics',
      });
    }
  }
);

/**
 * GET /api/search
 *
 * Authorization-aware global search across:
 *   - cases
 *   - evidence
 *   - documents
 *   - reports
 */
router.get(
  '/search',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const query = String(req.query.q || '').trim();
    const user = req.user!;

    if (!query) {
      return res.json({
        cases: [],
        evidence: [],
        documents: [],
        reports: [],
      });
    }

    const searchTerm = `%${query}%`;
    const visibility = getCaseVisibility(user, 'c');

    try {
      const casesRes = await db.query(
        `SELECT
           c.id,
           c.case_number,
           c.title,
           c.summary,
           c.status,
           c.priority,
           c.sensitivity,
           c.jurisdiction
         FROM cases c
         WHERE (
           c.case_number ILIKE $2
           OR c.title ILIKE $2
           OR c.summary ILIKE $2
           OR c.statute_violation ILIKE $2
         )
         AND ${visibility.sql}
         LIMIT 10`,
        [visibility.params[0], searchTerm]
      );

      /*
       * The query above uses $2 for the search term when the visibility
       * predicate uses $1. For ADMIN there is no $1 predicate, so run
       * the ADMIN version separately.
       */
      let authorizedCases = casesRes;

      if (user.role === 'ADMIN') {
        authorizedCases = await db.query(
          `SELECT
             c.id,
             c.case_number,
             c.title,
             c.summary,
             c.status,
             c.priority,
             c.sensitivity,
             c.jurisdiction
           FROM cases c
           WHERE (
             c.case_number ILIKE $1
             OR c.title ILIKE $1
             OR c.summary ILIKE $1
             OR c.statute_violation ILIKE $1
           )
           LIMIT 10`,
          [searchTerm]
        );
      }

      let evidenceRes;
      let docsRes;
      let reportsRes;

      if (user.role === 'ADMIN') {
        evidenceRes = await db.query(
          `SELECT
             e.id,
             e.case_id,
             e.tracking_number,
             e.title,
             e.category,
             e.storage_location,
             e.sha256_hash,
             c.case_number
           FROM evidence_items e
           JOIN cases c ON e.case_id = c.id
           WHERE (
             e.tracking_number ILIKE $1
             OR e.title ILIKE $1
             OR e.description ILIKE $1
           )
           LIMIT 10`,
          [searchTerm]
        );

        docsRes = await db.query(
          `SELECT
             d.id,
             d.case_id,
             d.document_number,
             d.title,
             d.doc_type,
             d.sensitivity,
             d.status,
             c.case_number
           FROM case_documents d
           JOIN cases c ON d.case_id = c.id
           WHERE (
             d.document_number ILIKE $1
             OR d.title ILIKE $1
             OR d.content_text ILIKE $1
           )
           LIMIT 10`,
          [searchTerm]
        );

        reportsRes = await db.query(
          `SELECT
             r.id,
             r.case_id,
             r.title,
             r.report_type,
             r.status,
             c.case_number
           FROM case_reports r
           JOIN cases c ON r.case_id = c.id
           WHERE (
             r.title ILIKE $1
             OR r.content ILIKE $1
           )
           LIMIT 10`,
          [searchTerm]
        );
      } else {
        const visibilityParams = [
          ...visibility.params,
          searchTerm,
        ];

        const searchParam =
          visibility.params.length + 1;

        evidenceRes = await db.query(
          `SELECT
             e.id,
             e.case_id,
             e.tracking_number,
             e.title,
             e.category,
             e.storage_location,
             e.sha256_hash,
             c.case_number
           FROM evidence_items e
           JOIN cases c ON e.case_id = c.id
           WHERE (
             e.tracking_number ILIKE $${searchParam}
             OR e.title ILIKE $${searchParam}
             OR e.description ILIKE $${searchParam}
           )
           AND ${visibility.sql}
           LIMIT 10`,
          visibilityParams
        );

        docsRes = await db.query(
          `SELECT
             d.id,
             d.case_id,
             d.document_number,
             d.title,
             d.doc_type,
             d.sensitivity,
             d.status,
             c.case_number
           FROM case_documents d
           JOIN cases c ON d.case_id = c.id
           WHERE (
             d.document_number ILIKE $${searchParam}
             OR d.title ILIKE $${searchParam}
             OR d.content_text ILIKE $${searchParam}
           )
           AND ${visibility.sql}
           LIMIT 10`,
          visibilityParams
        );

        reportsRes = await db.query(
          `SELECT
             r.id,
             r.case_id,
             r.title,
             r.report_type,
             r.status,
             c.case_number
           FROM case_reports r
           JOIN cases c ON r.case_id = c.id
           WHERE (
             r.title ILIKE $${searchParam}
             OR r.content ILIKE $${searchParam}
           )
           AND ${visibility.sql}
           LIMIT 10`,
          visibilityParams
        );
      }

      return res.json({
        cases: authorizedCases.rows,
        evidence: evidenceRes.rows,
        documents: docsRes.rows,
        reports: reportsRes.rows,
      });
    } catch (err: any) {
      console.error('[SEARCH] Search query failed:', err);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to perform search',
      });
    }
  }
);

/**
 * GET /api/users
 *
 * User directory used by authorized workflow screens.
 *
 * Supervisors/Admins need the directory for assignment/workflow.
 * IO users may need IO/Supervisor recipients for custody transfer.
 * Legal users do not receive the operational directory.
 */
router.get(
  '/users',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    if (
      user.role !== 'ADMIN' &&
      user.role !== 'SUPERVISOR' &&
      user.role !== 'IO'
    ) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'User directory access is restricted',
      });
    }

    try {
      let result;

      if (user.role === 'ADMIN') {
        result = await db.query(
          `SELECT
             id,
             username,
             full_name,
             role,
             jurisdiction,
             badge_number
           FROM users
           WHERE is_active = TRUE
           ORDER BY full_name ASC`
        );
      } else {
        result = await db.query(
          `SELECT
             id,
             username,
             full_name,
             role,
             jurisdiction,
             badge_number
           FROM users
           WHERE is_active = TRUE
           AND jurisdiction = $1
           AND role IN ('IO', 'SUPERVISOR')
           ORDER BY full_name ASC`,
          [user.jurisdiction]
        );
      }

      return res.json({
        users: result.rows,
      });
    } catch (err: any) {
      console.error('[USERS] User directory query failed:', err);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to load user directory',
      });
    }
  }
);

/**
 * GET /api/notifications
 *
 * Users can only retrieve their own notifications.
 */
router.get(
  '/notifications',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    try {
      const notifs = await db.query(
        `SELECT
           id,
           user_id,
           severity,
           title,
           message,
           case_id,
           is_read,
           created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [user.id]
      );

      return res.json({
        notifications: notifs.rows,
        count: notifs.rows.length,
      });
    } catch (err: any) {
      console.error(
        '[NOTIFICATIONS] Notification query failed:',
        err
      );

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to load notifications',
      });
    }
  }
);

/**
 * PATCH /api/notifications/:id/read
 *
 * A notification can only be marked read by its owner.
 */
router.patch(
  '/notifications/:id/read',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const notifId = req.params.id;

    try {
      const result = await db.query(
        `UPDATE notifications
         SET is_read = TRUE
         WHERE id = $1
         AND user_id = $2
         RETURNING id`,
        [notifId, user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        });
      }

      return res.json({
        success: true,
        notificationId: notifId,
      });
    } catch (err: any) {
      console.error(
        '[NOTIFICATIONS] Mark-as-read failed:',
        err
      );

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to update notification',
      });
    }
  }
);

export default router;