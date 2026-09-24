import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';

import { db } from '../db.ts';
import {
  requireAuth,
  requireSecurityCheck,
  AuthenticatedRequest,
} from '../auth.ts';

const router = Router();

// =========================================================
// VALIDATION
// =========================================================

const DiaryEntrySchema = z.object({
  case_id: z.string().trim().min(1).max(100),
  content: z.string().trim().min(1).max(10000),
});

// =========================================================
// GET INVESTIGATION DIARY
// =========================================================

/**
 * GET /api/investigation/diary?caseId=<case-id>
 *
 * Returns the investigation diary for a case.
 *
 * Access:
 * - IO
 * - Supervisor
 * - Legal
 * - Admin
 *
 * CASE_READ is responsible for contextual case authorization.
 */
router.get(
  '/diary',
  requireAuth,
  requireSecurityCheck('CASE_READ'),
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
      // -----------------------------------------------------
      // Verify that the case actually exists.
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
      // Fetch diary entries with author information.
      // -----------------------------------------------------

      const diaryResult = await db.query(
        `
          SELECT
            d.id,
            d.case_id,
            d.author_id,
            d.content,
            d.created_at,
            u.full_name AS author_name,
            u.badge_number AS author_badge,
            u.role AS author_role
          FROM investigation_diary d
          INNER JOIN users u
            ON d.author_id = u.id
          WHERE d.case_id = $1
          ORDER BY d.created_at DESC, d.id DESC
        `,
        [caseId]
      );

      return res.json({
        caseId,
        entries: diaryResult.rows,
        count: diaryResult.rows.length,
      });
    } catch (error: unknown) {
      console.error(
        '[INVESTIGATION_DIARY] Failed to fetch diary:',
        error
      );

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to retrieve the investigation diary.',
      });
    }
  }
);

// =========================================================
// CREATE INVESTIGATION DIARY ENTRY
// =========================================================

/**
 * POST /api/investigation/diary
 *
 * Creates an investigation diary entry.
 *
 * Access:
 * - IO only
 *
 * The CASE_UPDATE middleware performs contextual case
 * authorization. We additionally enforce the professional
 * role boundary here so supervisors/admins cannot write
 * investigation proceedings merely because they can update
 * other case metadata.
 */
router.post(
  '/diary',
  requireAuth,
  requireSecurityCheck('CASE_UPDATE'),
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    // -------------------------------------------------------
    // Explicit role boundary.
    // -------------------------------------------------------

    if (req.user?.role !== 'IO') {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        message:
          'Only an Investigating Officer can create investigation diary entries.',
      });
    }

    // -------------------------------------------------------
    // Validate request body.
    // -------------------------------------------------------

    const parseResult =
      DiaryEntrySchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
    }

    const {
      case_id: caseId,
      content,
    } = parseResult.data;

    const authorId = req.user.id;

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
        [caseId]
      );

      if (caseResult.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message: 'The requested case does not exist.',
        });
      }

      // -----------------------------------------------------
      // Generate a unique diary entry identifier.
      // -----------------------------------------------------

      const entryId =
        `diary_${crypto.randomUUID()}`;

      // -----------------------------------------------------
      // Insert the diary entry.
      //
      // The current database schema intentionally keeps the
      // diary distinct from audit logs.
      // -----------------------------------------------------

      const insertResult = await db.query(
        `
          INSERT INTO investigation_diary (
            id,
            case_id,
            author_id,
            content
          )
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            case_id,
            author_id,
            content,
            created_at
        `,
        [
          entryId,
          caseId,
          authorId,
          content,
        ]
      );

      const entry = insertResult.rows[0];

      return res.status(201).json({
        success: true,
        entry,
      });
    } catch (error: unknown) {
      console.error(
        '[INVESTIGATION_DIARY] Failed to create diary entry:',
        error
      );

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Unable to create the investigation diary entry.',
      });
    }
  }
);

export default router;