import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db.ts';
import {
  requireAuth,
  requireSecurityCheck,
  AuthenticatedRequest,
} from '../auth.ts';
import { logAuditEvent } from '../audit.ts';
import { createIntegrityAnchor } from '../blockchain.ts';

const router = Router();

const CreateEventSchema = z.object({
  case_id: z.string().min(1),
  event_timestamp: z.string().datetime({ offset: true }),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(5000),
  source_type: z.enum([
    'CCTV_FOOTAGE',
    'WITNESS_STATEMENT',
    'CAD_DISPATCH',
    'FORENSIC_LAB',
    'PHONE_RECORDS',
    'FINANCIAL_LEDGER',
    'ARREST_REPORT',
  ]),
  corroboration_level: z.enum([
    'UNVERIFIED',
    'CORROBORATED',
    'DEFINITIVE_RECORD',
  ]),
});

/**
 * GET /api/cases/:caseId/timeline
 *
 * Returns the investigation timeline for one authorized case.
 *
 * The timeline combines persisted investigation records:
 * - manual investigation events
 * - diary entries
 * - document ingestion
 * - evidence collection
 * - custody activity
 * - investigation reports
 *
 * Technical audit events intentionally remain separate.
 */
router.get(
  '/cases/:caseId/timeline',
  requireAuth,
  requireSecurityCheck('CASE_READ'),
  async (req: AuthenticatedRequest, res: Response) => {
    const caseId = req.params.caseId;

    if (!caseId) {
      return res.status(400).json({
        error: 'MISSING_CASE_ID',
      });
    }

    try {
      const caseCheck = await db.query(
        `
        SELECT
          c.id,
          c.case_number,
          c.title,
          c.jurisdiction,
          c.lead_io_id,
          c.status
        FROM cases c
        WHERE c.id = $1
        LIMIT 1
        `,
        [caseId],
      );

      if (caseCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
        });
      }

      /*
       * Authorization is already enforced by requireSecurityCheck.
       * This query intentionally returns only records belonging
       * to the requested case.
       */
      const eventsResult = await db.query(
        `
        SELECT
          id,
          event_timestamp,
          title,
          description,
          source_type,
          corroboration_level,
          verified_by_id,
          'MANUAL_EVENT' AS record_type
        FROM timeline_events
        WHERE case_id = $1

        UNION ALL

        SELECT
          id,
          created_at AS event_timestamp,
          'Investigation Diary Entry' AS title,
          content AS description,
          'INVESTIGATION_DIARY' AS source_type,
          'CORROBORATED' AS corroboration_level,
          author_id AS verified_by_id,
          'DIARY' AS record_type
        FROM investigation_diary
        WHERE case_id = $1

        UNION ALL

        SELECT
          id,
          created_at AS event_timestamp,
          'Document Ingested: ' || title AS title,
          CONCAT(
            'Document ',
            document_number,
            ' • Type: ',
            doc_type,
            ' • Status: ',
            status
          ) AS description,
          'DOCUMENT' AS source_type,
          'DEFINITIVE_RECORD' AS corroboration_level,
          author_id AS verified_by_id,
          'DOCUMENT' AS record_type
        FROM case_documents
        WHERE case_id = $1

        UNION ALL

        SELECT
          id,
          collected_at AS event_timestamp,
          'Evidence Collected: ' || title AS title,
          CONCAT(
            tracking_number,
            ' • ',
            category,
            CASE
              WHEN file_name IS NOT NULL
                THEN ' • File: ' || file_name
              ELSE ''
            END
          ) AS description,
          'EVIDENCE' AS source_type,
          'DEFINITIVE_RECORD' AS corroboration_level,
          collected_by_id AS verified_by_id,
          'EVIDENCE' AS record_type
        FROM evidence_items
        WHERE case_id = $1

        UNION ALL

        SELECT
          c.id,
          c.recorded_at AS event_timestamp,
          CASE
            WHEN c.action_type = 'INITIAL_COLLECTION'
              THEN 'Evidence Custody Initialized'
            WHEN c.action_type = 'TRANSFER'
              THEN 'Evidence Custody Transfer'
            ELSE 'Evidence Custody Activity'
          END AS title,
          CONCAT(
            c.action_type,
            ' • ',
            u_from.full_name,
            ' → ',
            u_to.full_name,
            ' • ',
            c.location,
            ' • ',
            c.reason
          ) AS description,
          'CUSTODY' AS source_type,
          'DEFINITIVE_RECORD' AS corroboration_level,
          c.transferred_from_id AS verified_by_id,
          'CUSTODY' AS record_type
        FROM chain_of_custody c
        JOIN users u_from
          ON u_from.id = c.transferred_from_id
        JOIN users u_to
          ON u_to.id = c.transferred_to_id
        WHERE c.case_id = $1

        UNION ALL

        SELECT
          id,
          created_at AS event_timestamp,
          'Investigation Report: ' || title AS title,
          CONCAT(
            report_type,
            ' • Status: ',
            status
          ) AS description,
          'REPORT' AS source_type,
          'CORROBORATED' AS corroboration_level,
          author_id AS verified_by_id,
          'REPORT' AS record_type
        FROM case_reports
        WHERE case_id = $1

        ORDER BY event_timestamp ASC
        `,
        [caseId],
      );

      const events = eventsResult.rows.map((event: any) => ({
        id: event.id,
        eventTimestamp: event.event_timestamp,
        title: event.title,
        description: event.description,
        sourceType: event.source_type,
        corroborationLevel: event.corroboration_level,
        verifiedById: event.verified_by_id,
        recordType: event.record_type,
      }));

      return res.json({
        caseId,
        events,
        count: events.length,
      });
    } catch (error: any) {
      console.error('[TIMELINE] Failed to load timeline:', error);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'Unable to load investigation timeline'
            : error?.message || 'Unable to load investigation timeline',
      });
    }
  },
);

/**
 * GET /api/timeline?caseId=<id>
 *
 * Backward-compatible endpoint for the existing frontend.
 */
router.get(
  '/',
  requireAuth,
  requireSecurityCheck('CASE_READ'),
  async (req: AuthenticatedRequest, res: Response) => {
    const caseId =
      typeof req.query.caseId === 'string'
        ? req.query.caseId.trim()
        : '';

    if (!caseId) {
      return res.status(400).json({
        error: 'MISSING_CASE_ID',
      });
    }

    try {
      const caseCheck = await db.query(
        `
        SELECT id
        FROM cases
        WHERE id = $1
        LIMIT 1
        `,
        [caseId],
      );

      if (caseCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
        });
      }

      const eventsResult = await db.query(
        `
        SELECT
          id,
          event_timestamp,
          title,
          description,
          source_type,
          corroboration_level,
          verified_by_id,
          'MANUAL_EVENT' AS record_type
        FROM timeline_events
        WHERE case_id = $1

        UNION ALL

        SELECT
          id,
          created_at AS event_timestamp,
          'Investigation Diary Entry' AS title,
          content AS description,
          'INVESTIGATION_DIARY' AS source_type,
          'CORROBORATED' AS corroboration_level,
          author_id AS verified_by_id,
          'DIARY' AS record_type
        FROM investigation_diary
        WHERE case_id = $1

        UNION ALL

        SELECT
          id,
          created_at AS event_timestamp,
          'Document Ingested: ' || title AS title,
          CONCAT(
            'Document ',
            document_number,
            ' • Type: ',
            doc_type,
            ' • Status: ',
            status
          ) AS description,
          'DOCUMENT' AS source_type,
          'DEFINITIVE_RECORD' AS corroboration_level,
          author_id AS verified_by_id,
          'DOCUMENT' AS record_type
        FROM case_documents
        WHERE case_id = $1

        UNION ALL

        SELECT
          id,
          collected_at AS event_timestamp,
          'Evidence Collected: ' || title AS title,
          CONCAT(
            tracking_number,
            ' • ',
            category
          ) AS description,
          'EVIDENCE' AS source_type,
          'DEFINITIVE_RECORD' AS corroboration_level,
          collected_by_id AS verified_by_id,
          'EVIDENCE' AS record_type
        FROM evidence_items
        WHERE case_id = $1

        UNION ALL

        SELECT
          c.id,
          c.recorded_at AS event_timestamp,
          'Evidence Custody Activity' AS title,
          CONCAT(
            c.action_type,
            ' • ',
            u_from.full_name,
            ' → ',
            u_to.full_name
          ) AS description,
          'CUSTODY' AS source_type,
          'DEFINITIVE_RECORD' AS corroboration_level,
          c.transferred_from_id AS verified_by_id,
          'CUSTODY' AS record_type
        FROM chain_of_custody c
        JOIN users u_from
          ON u_from.id = c.transferred_from_id
        JOIN users u_to
          ON u_to.id = c.transferred_to_id
        WHERE c.case_id = $1

        UNION ALL

        SELECT
          id,
          created_at AS event_timestamp,
          'Investigation Report: ' || title AS title,
          CONCAT(
            report_type,
            ' • Status: ',
            status
          ) AS description,
          'REPORT' AS source_type,
          'CORROBORATED' AS corroboration_level,
          author_id AS verified_by_id,
          'REPORT' AS record_type
        FROM case_reports
        WHERE case_id = $1

        ORDER BY event_timestamp ASC
        `,
        [caseId],
      );

      return res.json({
        caseId,
        events: eventsResult.rows,
        count: eventsResult.rows.length,
      });
    } catch (error: any) {
      console.error('[TIMELINE] Failed to load legacy timeline:', error);

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'Unable to load investigation timeline'
            : error?.message || 'Unable to load investigation timeline',
      });
    }
  },
);

/**
 * POST /api/timeline
 *
 * Creates a substantive investigation timeline event.
 * Authorization is restricted by TIMELINE_ADD.
 */
router.post(
  '/',
  requireAuth,
  requireSecurityCheck('TIMELINE_ADD'),
  async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = CreateEventSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.format(),
      });
    }

    const data = parseResult.data;
    const user = req.user!;

    const id = `tm_${crypto.randomUUID()}`;

    try {
      const caseCheck = await db.query(
        `
        SELECT id
        FROM cases
        WHERE id = $1
        LIMIT 1
        `,
        [data.case_id],
      );

      if (caseCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
        });
      }

      await db.query(
        `
        INSERT INTO timeline_events (
          id,
          case_id,
          event_timestamp,
          title,
          description,
          source_type,
          corroboration_level,
          verified_by_id,
          is_verified
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          id,
          data.case_id,
          data.event_timestamp,
          data.title,
          data.description,
          data.source_type,
          data.corroboration_level,
          user.id,
          data.corroboration_level !== 'UNVERIFIED',
        ],
      );

      await logAuditEvent({
        userId: user.id,
        action: 'TIMELINE_EVENT_LOGGED',
        targetType: 'TIMELINE_EVENT',
        targetId: id,
        caseId: data.case_id,
        ipAddress: req.ip || '127.0.0.1',
        details: {
          title: data.title,
          eventTimestamp: data.event_timestamp,
          sourceType: data.source_type,
          corroborationLevel: data.corroboration_level,
        },
        status: 'SUCCESS',
      });

      const eventHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          timestamp: data.event_timestamp,
          title: data.title,
          description: data.description,
          sourceType: data.source_type,
        }))
        .digest('hex');

      const integrityAnchor = await createIntegrityAnchor({
        caseId: data.case_id,
        entityType: 'TIMELINE_EVENT',
        entityId: id,
        eventType: 'TIMELINE_EVENT_LOGGED',
        sha256Hash: eventHash,
        actorId: user.id,
        metadata: {
          sourceType: data.source_type,
          corroborationLevel: data.corroboration_level,
        },
      }).catch((error) => {
        console.error('[TIMELINE] Integrity anchor failed after commit:', error);
        return null;
      });

      return res.status(201).json({
        success: true,
        eventId: id,
        integrityAnchor,
      });
    } catch (error: any) {
      console.error('[TIMELINE] Failed to create event:', error);

      try {
        await logAuditEvent({
          userId: user.id,
          action: 'TIMELINE_EVENT_LOGGED',
          targetType: 'TIMELINE_EVENT',
          targetId: id,
          caseId: data.case_id,
          ipAddress: req.ip || '127.0.0.1',
          details: {
            title: data.title,
            error: error?.message || 'Unknown database error',
          },
          status: 'SECURITY_ALERT',
        });
      } catch {
        // Preserve the original API error if audit logging also fails.
      }

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'Unable to create timeline event'
            : error?.message || 'Unable to create timeline event',
      });
    }
  },
);

export default router;
