import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';

import { db } from '../db.ts';
import { logAuditEvent } from '../audit.ts';
import {
  requireAuth,
  requireSecurityCheck,
  AuthenticatedRequest,
} from '../auth.ts';

const router = Router();

// =========================================================
// VALIDATION
// =========================================================

const ReviewSchema = z.object({
  case_id: z.string().trim().min(1).max(100),

  review_type: z.enum([
    'SUPERVISORY',
    'LEGAL_COMPLIANCE',
    'PROBABLE_CAUSE_AUDIT',
    'INDICTMENT_REVIEW',
  ]),

  decision: z.enum([
    'APPROVED',
    'CHANGES_REQUIRED',
    'REJECTED',
    'FLAGGED_DEFICIENCY',
  ]),

  comments: z
    .string()
    .trim()
    .min(10)
    .max(10000),

  statutory_notes: z
    .string()
    .trim()
    .max(10000)
    .optional(),
});

// =========================================================
// GET REVIEWS
// =========================================================

/**
 * GET /api/reviews?caseId=<case-id>
 *
 * Case-specific review retrieval.
 *
 * When caseId is supplied, CASE_READ performs the normal
 * contextual authorization check.
 *
 * Without caseId, results are restricted by the user's
 * professional scope instead of exposing every review.
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

    try {
      // -----------------------------------------------------
      // Case-specific request
      // -----------------------------------------------------

      if (caseId) {
        // Reuse the application's central authorization
        // policy rather than duplicating case access rules.
        //
        // The middleware is invoked manually here because
        // this route also supports an authorized global view.
        const securityMiddleware =
          requireSecurityCheck('CASE_READ');

        let securityCompleted = false;

        await new Promise<void>((resolve, reject) => {
          securityMiddleware(
            req,
            res,
            (error?: unknown) => {
              if (error) {
                reject(error);
                return;
              }

              securityCompleted = true;
              resolve();
            }
          );
        });

        if (!securityCompleted || res.headersSent) {
          return;
        }

        // ---------------------------------------------------
        // Verify that the case exists.
        // ---------------------------------------------------

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

        const reviewResult = await db.query(
          `
            SELECT
              r.*,
              c.case_number,
              c.title AS case_title,
              u.full_name AS reviewer_name,
              u.badge_number AS reviewer_badge,
              u.role AS reviewer_role
            FROM case_reviews r
            INNER JOIN cases c
              ON r.case_id = c.id
            INNER JOIN users u
              ON r.reviewer_id = u.id
            WHERE r.case_id = $1
            ORDER BY r.created_at DESC, r.id DESC
          `,
          [caseId]
        );

        return res.json({
          caseId,
          reviews: reviewResult.rows,
          count: reviewResult.rows.length,
        });
      }

      // -----------------------------------------------------
      // Global review view.
      //
      // Never return every review to every authenticated user.
      // Scope the query according to the user's role.
      // -----------------------------------------------------

      const user = req.user!;

      let query = `
        SELECT
          r.*,
          c.case_number,
          c.title AS case_title,
          c.jurisdiction,
          u.full_name AS reviewer_name,
          u.badge_number AS reviewer_badge,
          u.role AS reviewer_role
        FROM case_reviews r
        INNER JOIN cases c
          ON r.case_id = c.id
        INNER JOIN users u
          ON r.reviewer_id = u.id
      `;

      const params: unknown[] = [];

      if (user.role === 'ADMIN') {
        // Admin security/audit role can view the complete
        // review register.
        query += `
          ORDER BY r.created_at DESC, r.id DESC
        `;
      } else if (user.role === 'SUPERVISOR') {
        query += `
          WHERE c.jurisdiction = $1
          ORDER BY r.created_at DESC, r.id DESC
        `;

        params.push(user.jurisdiction);
      } else if (user.role === 'IO') {
        query += `
          WHERE (
            c.lead_io_id = $1
            OR EXISTS (
              SELECT 1
              FROM case_assignments ca
              WHERE ca.case_id = c.id
                AND ca.user_id = $1
            )
          )
          ORDER BY r.created_at DESC, r.id DESC
        `;

        params.push(user.id);
      } else if (user.role === 'LEGAL') {
        query += `
          WHERE EXISTS (
            SELECT 1
            FROM case_assignments ca
            WHERE ca.case_id = c.id
              AND ca.user_id = $1
          )
          ORDER BY r.created_at DESC, r.id DESC
        `;

        params.push(user.id);
      } else {
        return res.status(403).json({
          error: 'ROLE_FORBIDDEN',
          message: 'Your role cannot access investigation reviews.',
        });
      }

      const reviewResult =
        await db.query(query, params);

      return res.json({
        reviews: reviewResult.rows,
        count: reviewResult.rows.length,
      });
    } catch (error: unknown) {
      console.error(
        '[REVIEWS] Failed to retrieve reviews:',
        error
      );

      if (res.headersSent) {
        return;
      }

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to retrieve investigation reviews.',
      });
    }
  }
);

// =========================================================
// CREATE REVIEW
// =========================================================

/**
 * POST /api/reviews
 *
 * Creates a persisted supervisory/legal review.
 *
 * Allowed:
 * - Supervisor
 * - Legal
 *
 * Review-type separation:
 *
 * Supervisor:
 *   - SUPERVISORY
 *   - PROBABLE_CAUSE_AUDIT
 *
 * Legal:
 *   - LEGAL_COMPLIANCE
 *   - INDICTMENT_REVIEW
 */
router.post(
  '/',
  requireAuth,
  requireSecurityCheck('REVIEW_SUBMIT'),
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    // -------------------------------------------------------
    // Validate request body.
    // -------------------------------------------------------

    const parseResult =
      ReviewSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;
    const user = req.user!;

    // -------------------------------------------------------
    // Role-specific review type enforcement.
    // -------------------------------------------------------

    const supervisorReviewTypes = new Set([
      'SUPERVISORY',
      'PROBABLE_CAUSE_AUDIT',
    ]);

    const legalReviewTypes = new Set([
      'LEGAL_COMPLIANCE',
      'INDICTMENT_REVIEW',
    ]);

    if (
      user.role === 'SUPERVISOR' &&
      !supervisorReviewTypes.has(data.review_type)
    ) {
      return res.status(403).json({
        error: 'REVIEW_TYPE_FORBIDDEN',
        message:
          'Supervisors can submit supervisory and probable-cause reviews only.',
      });
    }

    if (
      user.role === 'LEGAL' &&
      !legalReviewTypes.has(data.review_type)
    ) {
      return res.status(403).json({
        error: 'REVIEW_TYPE_FORBIDDEN',
        message:
          'Legal reviewers can submit legal-compliance and indictment reviews only.',
      });
    }

    if (
      user.role !== 'SUPERVISOR' &&
      user.role !== 'LEGAL'
    ) {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        message:
          'Only supervisors and legal reviewers can submit case reviews.',
      });
    }

    const reviewId =
      `rev_${crypto.randomUUID()}`;

    try {
      // -----------------------------------------------------
      // Verify case existence.
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
        [data.case_id]
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message: 'The requested case does not exist.',
        });
      }

      // -----------------------------------------------------
      // Insert review.
      // -----------------------------------------------------

      const insertResult = await db.query(
        `
          INSERT INTO case_reviews (
            id,
            case_id,
            reviewer_id,
            review_type,
            decision,
            comments,
            statutory_notes
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )
          RETURNING
            id,
            case_id,
            reviewer_id,
            review_type,
            decision,
            comments,
            statutory_notes,
            created_at
        `,
        [
          reviewId,
          data.case_id,
          user.id,
          data.review_type,
          data.decision,
          data.comments,
          data.statutory_notes || '',
        ]
      );

      // -----------------------------------------------------
      // Advance workflow state only when the review is
      // approved.
      // -----------------------------------------------------

      if (data.decision === 'APPROVED') {
        if (
          data.review_type === 'INDICTMENT_REVIEW' ||
          data.review_type === 'LEGAL_COMPLIANCE'
        ) {
          await db.query(
            `
              UPDATE cases
              SET
                status = 'INDICTMENT_READY',
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `,
            [data.case_id]
          );
        } else if (
          data.review_type === 'SUPERVISORY'
        ) {
          await db.query(
            `
              UPDATE cases
              SET
                status = 'LEGAL_REVIEW',
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `,
            [data.case_id]
          );
        }
      }

      // -----------------------------------------------------
      // Audit the review action.
      //
      // Do not put the full review text into the audit log.
      // The review itself is already persisted in case_reviews.
      // -----------------------------------------------------

      await logAuditEvent({
        userId: user.id,
        action: 'CASE_REVIEW_RECORDED',
        targetType: 'CASE_REVIEW',
        targetId: reviewId,
        caseId: data.case_id,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          reviewer: user.full_name,
          role: user.role,
          reviewType: data.review_type,
          decision: data.decision,
          commentLength: data.comments.length,
          statutoryNotesProvided:
            Boolean(data.statutory_notes),
        },
        status: 'SUCCESS',
      });

      return res.status(201).json({
        success: true,
        reviewId,
        decision: data.decision,
        review: insertResult.rows[0],
      });
    } catch (error: unknown) {
      console.error(
        '[REVIEWS] Failed to create review:',
        error
      );

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to record the case review.',
      });
    }
  }
);

export default router;