import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db.ts';
import { logAuditEvent } from './audit.ts';
import {
  AuthUser,
  SecurityAction,
  evaluateAccessPolicy,
} from './accessControl.ts';

// Re-export the policy evaluator so route modules can import it from auth.ts.
export { evaluateAccessPolicy };

export const SESSION_COOKIE_NAME = 'sims_session';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * Creates a cryptographically random session token and stores it in the database.
 */
export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const token =
    'sims_sess_' + crypto.randomBytes(32).toString('hex');

  const expiresAt = new Date(
    Date.now() + SESSION_TTL_MS
  ).toISOString();

  await db.query(
    `INSERT INTO sessions (
       id,
       user_id,
       ip_address,
       user_agent,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5)`,
    [
      token,
      userId,
      ipAddress || '127.0.0.1',
      userAgent || 'internal-client',
      expiresAt,
    ]
  );

  return token;
}

/**
 * Extracts the session token from the httpOnly session cookie. Browser code
 * never receives the token, preventing script injection from exfiltrating it.
 */
export function extractToken(req: Request): string | null {
  const cookieToken =
    req.cookies?.[SESSION_COOKIE_NAME];

  if (
    cookieToken &&
    typeof cookieToken === 'string'
  ) {
    return cookieToken.trim();
  }

  return null;
}

/**
 * Validates a session token and returns the authenticated
 * institutional user.
 */
export async function validateSession(
  token: string
): Promise<AuthUser | null> {
  if (!token) {
    return null;
  }

  const res = await db.query(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       u.id,
       u.username,
       u.email,
       u.full_name,
       u.role,
       u.jurisdiction,
       u.badge_number,
       u.is_active,
       u.locked_until
     FROM sessions s
     JOIN users u
       ON s.user_id = u.id
     WHERE s.id = $1`,
    [token]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0] as any;

  // Session expiration
  if (
    new Date(row.expires_at).getTime() <
    Date.now()
  ) {
    await db.query(
      'DELETE FROM sessions WHERE id = $1',
      [token]
    );

    return null;
  }

  // User must be active
  if (!row.is_active) {
    return null;
  }

  // User must not currently be locked
  if (
    row.locked_until &&
    new Date(row.locked_until).getTime() >
      Date.now()
  ) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    jurisdiction: row.jurisdiction,
    badge_number: row.badge_number,
  };
}

/**
 * Authentication middleware.
 *
 * A valid institutional session is required.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = extractToken(req);

    if (!token) {
      res.clearCookie(
        SESSION_COOKIE_NAME,
        { path: '/' }
      );

      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message:
          'A valid institutional session is required to access SIMS resources.',
      });
    }

    const user = await validateSession(token);

    if (!user) {
      res.clearCookie(
        SESSION_COOKIE_NAME,
        { path: '/' }
      );

      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message:
          'A valid institutional session is required to access SIMS resources.',
      });
    }

    req.user = user;

    return next();
  } catch (error) {
    console.error(
      'Authentication middleware error:',
      error
    );

    return res.status(500).json({
      error: 'AUTHENTICATION_ERROR',
      message:
        'Unable to validate the institutional session.',
    });
  }
}

/**
 * Resolves the target case for an authorization check.
 *
 * Supported locations:
 *
 *   /api/cases/:id
 *   /api/cases/:caseId/...
 *   /api/reports?caseId=...
 *   /api/timeline?caseId=...
 *   /api/investigation/diary?caseId=...
 *   body.case_id
 *
 * Special handling:
 *
 *   /api/evidence/:id/custody
 *
 * Here :id is an evidence ID, so the case ID is resolved
 * from evidence_items instead of incorrectly treating the
 * evidence ID as a case ID.
 */
async function resolveSecurityCaseId(
  req: AuthenticatedRequest,
  action: SecurityAction,
  customExtractor?: (
    req: Request
  ) => string | undefined
): Promise<{
  caseId?: string;
  evidenceId?: string;
}> {
  /*
   * Explicit route extractor has highest priority.
   */
  if (customExtractor) {
    const extracted = customExtractor(req);

    if (extracted) {
      return {
        caseId: extracted,
        evidenceId:
          req.params.evidenceId ||
          req.body?.evidence_id,
      };
    }
  }

  /*
   * Normal case-scoped routes.
   */
  const queryCaseId =
    typeof req.query.caseId === 'string'
      ? req.query.caseId.trim()
      : undefined;

  const queryCaseIdSnake =
    typeof req.query.case_id === 'string'
      ? req.query.case_id.trim()
      : undefined;

  const paramCaseId =
    typeof req.params.caseId === 'string'
      ? req.params.caseId.trim()
      : undefined;

  const bodyCaseId =
    typeof req.body?.case_id === 'string'
      ? req.body.case_id.trim()
      : undefined;

  /*
   * Some routes use /:id for a CASE.
   *
   * Do not use params.id as a case ID for custody transfers,
   * because there :id is an EVIDENCE ID.
   */
  const genericParamId =
    typeof req.params.id === 'string'
      ? req.params.id.trim()
      : undefined;

  const evidenceId =
    typeof req.params.evidenceId === 'string'
      ? req.params.evidenceId.trim()
      : typeof req.body?.evidence_id === 'string'
        ? req.body.evidence_id.trim()
        : undefined;

  /*
   * Evidence custody:
   *
   * POST /api/evidence/:id/custody
   *
   * In this route:
   *   req.params.id === evidence ID
   *
   * Resolve the actual case_id from evidence_items.
   */
  if (
    action === 'EVIDENCE_CUSTODY_TRANSFER'
  ) {
    const custodyEvidenceId =
      evidenceId || genericParamId;

    if (custodyEvidenceId) {
      const evidenceResult = await db.query(
        `SELECT
           id,
           case_id
         FROM evidence_items
         WHERE id = $1`,
        [custodyEvidenceId]
      );

      if (evidenceResult.rows.length > 0) {
        const evidenceRow =
          evidenceResult.rows[0] as {
            id: string;
            case_id: string;
          };

        return {
          caseId: evidenceRow.case_id,
          evidenceId: evidenceRow.id,
        };
      }

      /*
       * Keep the evidence ID so the authorization
       * layer can reject the request rather than
       * accidentally authorizing an unknown object.
       */
      return {
        caseId:
          queryCaseId ||
          queryCaseIdSnake ||
          paramCaseId ||
          bodyCaseId,
        evidenceId: custodyEvidenceId,
      };
    }
  }

  /*
   * Document-signing routes use /:id, where the parameter is a document ID
   * rather than a case ID. Resolve its owning case before authorization so a
   * document identifier cannot be treated as an unrelated case identifier.
   */
  if (action === 'DOCUMENT_SIGN' && genericParamId) {
    const documentResult = await db.query(
      `SELECT case_id
       FROM case_documents
       WHERE id = $1`,
      [genericParamId],
    );

    if (documentResult.rows.length > 0) {
      return {
        caseId: (documentResult.rows[0] as { case_id: string }).case_id,
        evidenceId,
      };
    }
  }

  /*
   * Normal case ID precedence.
   */
  const caseId =
    paramCaseId ||
    queryCaseId ||
    queryCaseIdSnake ||
    bodyCaseId ||
    genericParamId;

  return {
    caseId,
    evidenceId,
  };
}

/**
 * Middleware factory for multi-layer authorization:
 *
 * role
 * + assignment
 * + jurisdiction
 * + sensitivity
 * + requested action
 *
 * Every denial is recorded in the append-only audit trail.
 */
export function requireSecurityCheck(
  action: SecurityAction,
  extractCaseId?: (
    req: Request
  ) => string | undefined
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message:
          'Authenticated institutional user is required.',
      });
    }

    try {
      const resolved =
        await resolveSecurityCaseId(
          req,
          action,
          extractCaseId
        );

      const caseId =
        resolved.caseId;

      const evidenceId =
        resolved.evidenceId;

      const ip =
        req.ip ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      /*
       * Evaluate authorization using the REAL case ID.
       *
       * For custody transfers the evidence ID is also
       * passed separately so accessControl can verify
       * the current custodian.
       */
      const evalResult =
        await evaluateAccessPolicy(
          req.user,
          action,
          caseId,
          {
            evidenceId,
            documentId:
              req.params.documentId ||
              req.body?.document_id,
          }
        );

      if (!evalResult.allowed) {
        await logAuditEvent({
          userId: req.user.id,
          action:
            `SECURITY_DENIED_${action}`,
          targetType:
            'ACCESS_CONTROL',
          targetId:
            caseId ||
            evidenceId ||
            null,
          caseId:
            caseId || null,
          ipAddress: ip,
          details: {
            requestedAction: action,
            denialReason:
              evalResult.reason,
            policyDetails:
              evalResult.policyDetails,
            path: req.originalUrl,
            method: req.method,
            resolvedCaseId:
              caseId || null,
            resolvedEvidenceId:
              evidenceId || null,
          },
          status: 'DENIED',
        });

        return res.status(403).json({
          error:
            'AUTHORIZATION_DENIED',
          message:
            evalResult.reason ||
            'Institutional security policy prevents this operation.',
          securityPolicy:
            evalResult.policyDetails,
        });
      }

      return next();
    } catch (error) {
      console.error(
        `Security authorization error for ${action}:`,
        error
      );

      /*
       * Fail closed.
       *
       * If authorization cannot be evaluated,
       * the operation must NOT continue.
       */
      try {
        const ip =
          req.ip ||
          req.socket.remoteAddress ||
          '127.0.0.1';

        await logAuditEvent({
          userId: req.user.id,
          action:
            `SECURITY_ERROR_${action}`,
          targetType:
            'ACCESS_CONTROL',
          targetId:
            null,
          caseId:
            null,
          ipAddress: ip,
          details: {
            requestedAction: action,
            path: req.originalUrl,
            method: req.method,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
          status: 'DENIED',
        });
      } catch (auditError) {
        console.error(
          'Failed to record authorization error:',
          auditError
        );
      }

      return res.status(403).json({
        error:
          'AUTHORIZATION_CHECK_FAILED',
        message:
          'Security authorization could not be completed. The operation was blocked.',
      });
    }
  };
}
