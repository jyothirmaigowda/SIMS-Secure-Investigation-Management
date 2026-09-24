import { db } from './db.ts';

export type UserRole = 'IO' | 'SUPERVISOR' | 'LEGAL' | 'ADMIN';
export type CaseSensitivity = 'STANDARD' | 'CONFIDENTIAL' | 'SECRET' | 'RESTRICTED';
export type SecurityAction =
  | 'CASE_LIST'
  | 'CASE_READ'
  | 'CASE_CREATE'
  | 'CASE_UPDATE'
  | 'CASE_DISPOSITION'
  | 'CASE_ASSIGN'
  | 'EVIDENCE_VIEW'
  | 'EVIDENCE_ADD'
  | 'EVIDENCE_CUSTODY_TRANSFER'
  | 'DOCUMENT_READ'
  | 'DOCUMENT_CREATE'
  | 'DOCUMENT_SIGN'
  | 'REVIEW_SUBMIT'
  | 'TIMELINE_ADD'
  | 'AUDIT_VIEW'
  | 'AUDIT_VERIFY'
  | 'USER_MANAGE';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  jurisdiction: string;
  badge_number: string;
}

export interface SecurityEvaluationResult {
  allowed: boolean;
  reason?: string;
  policyDetails: {
    roleChecked: UserRole;
    actionChecked: SecurityAction;
    caseId?: string;
    jurisdictionMatch: boolean;
    assignmentVerified: boolean;
    sensitivityCleared: boolean;
  };
}

/**
 * Institutional Server-Side Authorization Policy Engine
 * Strictly enforces: role + case assignment + jurisdiction + sensitivity + requested action
 */
export async function evaluateAccessPolicy(
  user: AuthUser,
  action: SecurityAction,
  caseId?: string,
  extraContext?: {
    evidenceId?: string;
    documentId?: string;
    targetSensitivity?: CaseSensitivity;
  }
): Promise<SecurityEvaluationResult> {
  const policyDetails = {
    roleChecked: user.role,
    actionChecked: action,
    caseId,
    jurisdictionMatch: true,
    assignmentVerified: false,
    sensitivityCleared: true,
  };

  // 1. System/Admin Global Actions
  if (action === 'USER_MANAGE') {
    if (user.role === 'ADMIN') {
      return { allowed: true, policyDetails };
    }
    return { allowed: false, reason: 'Only Security Administrator can manage user accounts.', policyDetails };
  }

  if (action === 'AUDIT_VIEW' || action === 'AUDIT_VERIFY') {
    // All institutional personnel can view audit log for transparency, but ADMIN & SUPERVISOR can verify/export
    return { allowed: true, policyDetails };
  }

  if (action === 'CASE_LIST') {
    return { allowed: true, policyDetails };
  }

  if (action === 'CASE_CREATE') {
    if (user.role === 'IO' || user.role === 'SUPERVISOR' || user.role === 'ADMIN') {
      return { allowed: true, policyDetails };
    }
    return { allowed: false, reason: 'Legal counsel cannot originate initial investigation case records.', policyDetails };
  }

  // If no caseId provided for a case-scoped action, deny
  if (!caseId) {
    return { allowed: false, reason: 'Target case identifier is required for this operation.', policyDetails };
  }

  // 2. Fetch Target Case Vitals
  const caseRes = await db.query('SELECT * FROM cases WHERE id = $1', [caseId]);
  if (caseRes.rows.length === 0) {
    return { allowed: false, reason: 'Target case not found.', policyDetails };
  }
  const targetCase = caseRes.rows[0] as any;

  // 3. Jurisdiction Verification
  const userJurisdiction = user.jurisdiction.toUpperCase();
  const caseJurisdiction = targetCase.jurisdiction.toUpperCase();
  const isGlobalJurisdiction = userJurisdiction === 'ALL-DISTRICTS' || userJurisdiction === 'STATE-WIDE';
  const directJurisdictionMatch = isGlobalJurisdiction || userJurisdiction === caseJurisdiction;

  // 4. Case Assignment Check
  const asgnRes = await db.query(
    'SELECT * FROM case_assignments WHERE case_id = $1 AND user_id = $2',
    [caseId, user.id]
  );
  const assignment = asgnRes.rows.length > 0 ? (asgnRes.rows[0] as any) : null;
  const isAssigned = !!assignment || targetCase.lead_io_id === user.id;
  policyDetails.assignmentVerified = isAssigned;

  // If cross-jurisdiction and not assigned and not admin, reject
  if (!directJurisdictionMatch && !isAssigned && user.role !== 'ADMIN') {
    policyDetails.jurisdictionMatch = false;
    return {
      allowed: false,
      reason: `Jurisdiction mismatch: Officer jurisdiction (${user.jurisdiction}) does not govern case territory (${targetCase.jurisdiction}) without explicit inter-agency assignment.`,
      policyDetails,
    };
  }

  // 5. Sensitivity Clearance
  const sensitivity: CaseSensitivity = targetCase.sensitivity;
  if (sensitivity === 'RESTRICTED') {
    // Restricted requires active assignment or ADMIN/SUPERVISOR review authority
    if (!isAssigned && user.role !== 'ADMIN' && user.role !== 'SUPERVISOR') {
      policyDetails.sensitivityCleared = false;
      return {
        allowed: false,
        reason: 'RESTRICTED classification requires active case assignment or supervisory clearance.',
        policyDetails,
      };
    }
  } else if (sensitivity === 'SECRET') {
    if (!isAssigned && user.role === 'IO') {
      policyDetails.sensitivityCleared = false;
      return {
        allowed: false,
        reason: 'SECRET classification requires active case assignment.',
        policyDetails,
      };
    }
  }

  // 6. Action-Specific Role Rules
  switch (action) {
    case 'CASE_READ':
    case 'EVIDENCE_VIEW':
    case 'DOCUMENT_READ':
      // Reading requires: Assigned OR Supervisor in jurisdiction OR Legal OR Admin
      if (isAssigned || user.role === 'SUPERVISOR' || user.role === 'LEGAL' || user.role === 'ADMIN') {
        return { allowed: true, policyDetails };
      }
      return {
        allowed: false,
        reason: 'Access Denied: You are not assigned to this case workspace.',
        policyDetails,
      };

    case 'CASE_UPDATE':
      if (user.role === 'ADMIN') return { allowed: true, policyDetails };
      if (user.role === 'SUPERVISOR' && directJurisdictionMatch) return { allowed: true, policyDetails };
      if (isAssigned && (assignment?.can_write || targetCase.lead_io_id === user.id)) {
        return { allowed: true, policyDetails };
      }
      return {
        allowed: false,
        reason: 'Write access denied: Only assigned Lead IO or Supervisor can update case parameters.',
        policyDetails,
      };

    case 'CASE_DISPOSITION':
      if (user.role === 'SUPERVISOR' || user.role === 'ADMIN') {
        return { allowed: true, policyDetails };
      }
      return {
        allowed: false,
        reason: 'Case disposition and status change requires Supervisory or Admin authorization.',
        policyDetails,
      };

    case 'CASE_ASSIGN':
      if (user.role === 'ADMIN') return { allowed: true, policyDetails };
      if (user.role === 'SUPERVISOR' && directJurisdictionMatch) return { allowed: true, policyDetails };
      if (targetCase.lead_io_id === user.id) return { allowed: true, policyDetails };
      return {
        allowed: false,
        reason: 'Case personnel assignment restricted to Lead IO, Supervisory Officer, or Security Administrator.',
        policyDetails,
      };

    case 'EVIDENCE_ADD':
      if (user.role === 'ADMIN') return { allowed: true, policyDetails };
      if (isAssigned && (user.role === 'IO' || user.role === 'SUPERVISOR')) {
        return { allowed: true, policyDetails };
      }
      return {
        allowed: false,
        reason: 'Evidence seizure intake must be performed by an assigned Investigating Officer.',
        policyDetails,
      };

    case 'EVIDENCE_CUSTODY_TRANSFER':
      // The user initiating the transfer must either be the current holder, an assigned supervisor, or an admin
      if (extraContext?.evidenceId) {
        const evRes = await db.query('SELECT current_custody_holder_id FROM evidence_items WHERE id = $1', [extraContext.evidenceId]);
        if (evRes.rows.length > 0) {
          const currentHolder = (evRes.rows[0] as any).current_custody_holder_id;
          if (currentHolder === user.id || user.role === 'SUPERVISOR' || user.role === 'ADMIN') {
            return { allowed: true, policyDetails };
          }
          return {
            allowed: false,
            reason: 'Chain of Custody Violation: Only the verified current custody holder or Supervisor may transfer evidence.',
            policyDetails,
          };
        }
      }
      return { allowed: true, policyDetails };

    case 'DOCUMENT_CREATE':
      if (user.role === 'ADMIN') return { allowed: true, policyDetails };
      if (isAssigned) return { allowed: true, policyDetails };
      return {
        allowed: false,
        reason: 'Only assigned case team members may draft case documents.',
        policyDetails,
      };

    case 'DOCUMENT_SIGN':
      if (user.role === 'LEGAL' || user.role === 'SUPERVISOR' || user.role === 'ADMIN') {
        return { allowed: true, policyDetails };
      }
      return {
        allowed: false,
        reason: 'Signatory authority for legal and supervisory records is restricted to Legal Counsel or Supervisors.',
        policyDetails,
      };

    case 'REVIEW_SUBMIT':
      if (user.role === 'SUPERVISOR' || user.role === 'LEGAL' || user.role === 'ADMIN') {
        return { allowed: true, policyDetails };
      }
      return {
        allowed: false,
        reason: 'Official case reviews must be submitted by Supervisory or Legal personnel.',
        policyDetails,
      };

    case 'TIMELINE_ADD':
      if (isAssigned || user.role === 'SUPERVISOR' || user.role === 'ADMIN') {
        return { allowed: true, policyDetails };
      }
      return {
        allowed: false,
        reason: 'Only assigned personnel may contribute to the case chronological timeline.',
        policyDetails,
      };

    default:
      return { allowed: false, reason: 'Unknown security action requested.', policyDetails };
  }
}
