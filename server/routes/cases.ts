import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db.ts';
import { logAuditEvent } from '../audit.ts';
import { requireAuth, requireSecurityCheck, AuthenticatedRequest } from '../auth.ts';

const router = Router();

const CreateCaseSchema = z.object({
  title: z.string().trim().min(5).max(300),
  summary: z.string().trim().min(10).max(10000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  sensitivity: z.enum(['STANDARD', 'CONFIDENTIAL', 'SECRET', 'RESTRICTED']),
  jurisdiction: z.string().trim().min(2).max(100),
  incident_date: z.string().datetime().optional(),
  location: z.string().trim().max(500).optional(),
  statute_violation: z.string().trim().max(5000).optional(),
});

const CaseDispositionSchema = z.object({
  status: z.enum([
    'DRAFT',
    'UNDER_INVESTIGATION',
    'SUPERVISOR_REVIEW',
    'LEGAL_REVIEW',
    'INDICTMENT_READY',
    'CLOSED',
    'ARCHIVED',
  ]),
  note: z.string().trim().max(5000).optional(),
});

const ReadinessUpdateSchema = z.object({
  is_compliant: z.boolean(),
  notes: z.string().trim().max(5000).optional(),
});

/**
 * GET /api/cases
 * Returns cases visible to current user based on jurisdiction, assignment & role
 */
router.get('/', requireAuth, requireSecurityCheck('CASE_LIST'), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  try {
    let query = `
      SELECT c.*,
             u.full_name as lead_io_name,
             u.badge_number as lead_io_badge,
             (SELECT COUNT(*) FROM evidence_items e WHERE e.case_id = c.id) as evidence_count,
             (SELECT COUNT(*) FROM case_documents d WHERE d.case_id = c.id) as document_count,
             (SELECT COUNT(*) FROM timeline_events t WHERE t.case_id = c.id) as timeline_count,
             (SELECT COUNT(*) FROM case_reviews r WHERE r.case_id = c.id) as review_count,
             EXISTS(SELECT 1 FROM case_assignments a WHERE a.case_id = c.id AND a.user_id = $1) as is_assigned
      FROM cases c
      JOIN users u ON c.lead_io_id = u.id
    `;
    const params: any[] = [user.id];

    // Role-based visibility scoping
    if (user.role === 'ADMIN') {
      // Admin sees all
      query += ` ORDER BY c.created_at DESC`;
    } else if (user.role === 'SUPERVISOR' || user.role === 'LEGAL') {
      // Both roles may read cases only within their jurisdiction unless they
      // have an explicit assignment handled by the central policy elsewhere.
      query += `
        WHERE c.jurisdiction = $2
           OR c.lead_io_id = $1
           OR EXISTS (
             SELECT 1
             FROM case_assignments a
             WHERE a.case_id = c.id
               AND a.user_id = $1
           )
        ORDER BY c.created_at DESC
      `;
      params.push(user.jurisdiction);
    } else if (user.role === 'IO') {
      // IO visibility must match CASE_READ: assigned cases or those led by
      // the authenticated officer only.
      query += `
        WHERE (
          c.lead_io_id = $1
          OR EXISTS(SELECT 1 FROM case_assignments a WHERE a.case_id = c.id AND a.user_id = $1)
        )
        ORDER BY c.created_at DESC
      `;
    } else {
      query += ` WHERE 1 = 0 ORDER BY c.created_at DESC`;
    }

    const casesRes = await db.query(query, params);
    return res.json({ cases: casesRes.rows });
  } catch (err: any) {
    console.error('Fetch cases error:', err);
    return res.status(500).json({ error: 'DATABASE_ERROR', message: err.message });
  }
});

/**
 * GET /api/cases/:id
 * Detailed case workspace view
 */
router.get('/:id', requireAuth, requireSecurityCheck('CASE_READ'), async (req: AuthenticatedRequest, res: Response) => {
  const caseId = req.params.id;
  try {
    const caseRes = await db.query(
      `SELECT c.*,
              u.full_name as lead_io_name,
              u.badge_number as lead_io_badge,
              u.email as lead_io_email
       FROM cases c
       JOIN users u ON c.lead_io_id = u.id
       WHERE c.id = $1`,
      [caseId]
    );

    if (caseRes.rows.length === 0) {
      return res.status(404).json({ error: 'CASE_NOT_FOUND' });
    }

    const caseItem = caseRes.rows[0] as any;

    // Fetch personnel assignments
    const asgnRes = await db.query(
      `SELECT a.*, u.full_name, u.badge_number, u.role as user_role, u.jurisdiction
       FROM case_assignments a
       JOIN users u ON a.user_id = u.id
       WHERE a.case_id = $1`,
      [caseId]
    );

    // Fetch readiness items
    const readyRes = await db.query(
      `SELECT r.*, u.full_name as verified_by_name
       FROM readiness_items r
       LEFT JOIN users u ON r.verified_by_id = u.id
       WHERE r.case_id = $1
       ORDER BY r.category, r.id`,
      [caseId]
    );

    // Log the read access for audit compliance
    await logAuditEvent({
      userId: req.user!.id,
      action: 'CASE_READ',
      targetType: 'CASE',
      targetId: caseId,
      caseId: caseId,
      ipAddress: req.ip || '127.0.0.1',
      details: { caseNumber: caseItem.case_number, userRole: req.user!.role },
      status: 'SUCCESS',
    });

    return res.json({
      case: caseItem,
      assignments: asgnRes.rows,
      readiness: readyRes.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'DATABASE_ERROR', message: err.message });
  }
});

/**
 * POST /api/cases
 * Creates a new case and assigns the creator as LEAD_IO
 */
router.post('/', requireAuth, requireSecurityCheck('CASE_CREATE'), async (req: AuthenticatedRequest, res: Response) => {
  const parseResult = CreateCaseSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: parseResult.error.format() });
  }

  const data = parseResult.data;
  const user = req.user!;

  if (
    user.role !== 'ADMIN' &&
    data.jurisdiction.toUpperCase() !== user.jurisdiction.toUpperCase()
  ) {
    await logAuditEvent({
      userId: user.id,
      action: 'CASE_CREATION_DENIED_JURISDICTION',
      targetType: 'CASE',
      ipAddress: req.ip || '127.0.0.1',
      details: {
        requestedJurisdiction: data.jurisdiction,
        userJurisdiction: user.jurisdiction,
      },
      status: 'DENIED',
    });

    return res.status(403).json({
      error: 'AUTHORIZATION_DENIED',
      message: 'Cases may only be created within your jurisdiction.',
    });
  }

  const id = 'case_' + Date.now().toString().slice(-6) + '_' + crypto.randomBytes(3).toString('hex');
  const year = new Date().getFullYear();
  const caseNumber = `SIMS-${year}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    await db.query(
      `INSERT INTO cases (id, case_number, title, summary, status, priority, sensitivity, jurisdiction, incident_date, location, statute_violation, lead_io_id, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        caseNumber,
        data.title,
        data.summary,
        'UNDER_INVESTIGATION',
        data.priority,
        data.sensitivity,
        data.jurisdiction,
        data.incident_date || new Date().toISOString(),
        data.location || 'Undisclosed',
        data.statute_violation || 'Under review',
        user.id,
        user.id,
      ]
    );

    // Automatically create LEAD_IO assignment
    await db.query(
      `INSERT INTO case_assignments (id, case_id, user_id, assigned_role, can_read, can_write, can_review, can_export)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['asgn_' + crypto.randomUUID().slice(0, 8), id, user.id, 'LEAD_IO', true, true, false, true]
    );

    // Populate baseline prosecution readiness checklist items
    const standardChecklist = [
      { cat: 'CONSTITUTIONAL_COMPLIANCE', name: 'Probable Cause / Warrant Inventory Filed' },
      { cat: 'CONSTITUTIONAL_COMPLIANCE', name: 'Miranda Rights Waiver Form 88-M on Record' },
      { cat: 'CHAIN_OF_CUSTODY', name: 'All Physical & Digital Evidence Signed and Vault-Secured' },
      { cat: 'DIGITAL_FORENSICS', name: 'Raw SHA-256 Hashes Corroborated with Lab Verification' },
      { cat: 'STATUTORY_ELEMENTS', name: 'Prima Facie Elements for Target Statutes Documented' },
      { cat: 'SUPERVISORY_APPROVAL', name: 'Supervisory Review and Sign-off' },
      { cat: 'LEGAL_ASSESSMENT', name: 'Prosecution Indictment Evaluation Memo Approved' },
    ];

    for (const item of standardChecklist) {
      await db.query(
        `INSERT INTO readiness_items (id, case_id, category, item_name, is_compliant)
         VALUES ($1, $2, $3, $4, FALSE)`,
        ['rd_' + crypto.randomUUID().slice(0, 8), id, item.cat, item.name]
      );
    }

    // Append-only audit record
    await logAuditEvent({
      userId: user.id,
      action: 'CASE_CREATED',
      targetType: 'CASE',
      targetId: id,
      caseId: id,
      ipAddress: req.ip || '127.0.0.1',
      details: { caseNumber, title: data.title, sensitivity: data.sensitivity, jurisdiction: data.jurisdiction },
      status: 'SUCCESS',
    });

    return res.status(201).json({ success: true, caseId: id, caseNumber });
  } catch (err: any) {
    console.error('Case creation error:', err);
    return res.status(500).json({ error: 'DATABASE_ERROR', message: err.message });
  }
});

/**
 * PATCH /api/cases/:id/disposition
 * Updates case status (requires SUPERVISOR or ADMIN authorization)
 */
router.patch('/:id/disposition', requireAuth, requireSecurityCheck('CASE_DISPOSITION'), async (req: AuthenticatedRequest, res: Response) => {
  const caseId = req.params.id;
  const parseResult = CaseDispositionSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      details: parseResult.error.flatten(),
    });
  }

  const { status, note } = parseResult.data;

  try {
    await db.query(
      `UPDATE cases SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [status, caseId]
    );

    await logAuditEvent({
      userId: req.user!.id,
      action: 'CASE_DISPOSITION_CHANGE',
      targetType: 'CASE',
      targetId: caseId,
      caseId: caseId,
      ipAddress: req.ip || '127.0.0.1',
      details: { newStatus: status, supervisoryNote: note, authorizedBy: req.user!.full_name, role: req.user!.role },
      status: 'SUCCESS',
    });

    return res.json({ success: true, newStatus: status });
  } catch (err: any) {
    return res.status(500).json({ error: 'DATABASE_ERROR', message: err.message });
  }
});

/**
 * PATCH /api/cases/:id/readiness/:itemId
 * Update compliance status of a readiness checklist item
 */
router.patch('/:id/readiness/:itemId', requireAuth, requireSecurityCheck('CASE_UPDATE'), async (req: AuthenticatedRequest, res: Response) => {
  const { id: caseId, itemId } = req.params;
  const parseResult = ReadinessUpdateSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      details: parseResult.error.flatten(),
    });
  }

  const { is_compliant, notes } = parseResult.data;

  try {
    await db.query(
      `UPDATE readiness_items
       SET is_compliant = $1, notes = $2, verified_by_id = $3, verified_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND case_id = $5`,
      [is_compliant, notes || null, is_compliant ? req.user!.id : null, itemId, caseId]
    );

    await logAuditEvent({
      userId: req.user!.id,
      action: 'READINESS_CHECK_UPDATE',
      targetType: 'READINESS_ITEM',
      targetId: itemId,
      caseId: caseId,
      ipAddress: req.ip || '127.0.0.1',
      details: { itemId, isCompliant: is_compliant, verifiedBy: req.user!.full_name },
      status: 'SUCCESS',
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'DATABASE_ERROR', message: err.message });
  }
});

export default router;
