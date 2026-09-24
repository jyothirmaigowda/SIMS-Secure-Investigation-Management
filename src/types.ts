export type UserRole = 'IO' | 'SUPERVISOR' | 'LEGAL' | 'ADMIN';

export type CaseStatus =
  | 'DRAFT'
  | 'UNDER_INVESTIGATION'
  | 'SUPERVISOR_REVIEW'
  | 'LEGAL_REVIEW'
  | 'INDICTMENT_READY'
  | 'CLOSED'
  | 'ARCHIVED';

export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CaseSensitivity = 'STANDARD' | 'CONFIDENTIAL' | 'SECRET' | 'RESTRICTED';

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  jurisdiction: string;
  badge_number: string;
}

export interface CaseAssignment {
  id: string;
  case_id: string;
  user_id: string;
  assigned_role: string;
  can_read: boolean;
  can_write: boolean;
  can_review: boolean;
  can_export: boolean;
  full_name: string;
  badge_number: string;
  user_role: UserRole;
  jurisdiction: string;
}

export interface CaseItem {
  id: string;
  case_number: string;
  title: string;
  summary: string;
  status: CaseStatus;
  priority: CasePriority;
  sensitivity: CaseSensitivity;
  jurisdiction: string;
  incident_date?: string;
  location?: string;
  statute_violation?: string;
  lead_io_id: string;
  lead_io_name?: string;
  lead_io_badge?: string;
  created_at: string;
  updated_at: string;
  evidence_count?: number;
  document_count?: number;
  timeline_count?: number;
  review_count?: number;
  is_assigned?: boolean;
}

export interface EvidenceItem {
  id: string;
  case_id: string;
  case_number?: string;
  case_title?: string;
  tracking_number: string;
  title: string;
  description: string;
  category: 'DIGITAL' | 'PHYSICAL' | 'FORENSIC' | 'DOCUMENTARY' | 'BIOLOGICAL' | 'SURVEILLANCE';
  storage_location: string;
  condition_notes?: string;
  file_name?: string;
  file_size?: number;
  sha256_hash: string;
  mime_type?: string;
  current_custody_holder_id: string;
  holder_name?: string;
  holder_badge?: string;
  collected_by_id: string;
  collector_name?: string;
  collector_badge?: string;
  collected_at: string;
  is_tampered?: boolean;
  created_at: string;
}

export interface CustodyRecord {
  id: string;
  evidence_id: string;
  case_id: string;
  transferred_from_id: string;
  transferred_to_id: string;
  from_name?: string;
  from_badge?: string;
  to_name?: string;
  to_badge?: string;
  action_type: string;
  reason: string;
  location: string;
  signature_hash: string;
  recorded_at: string;
}

export interface CaseDocument {
  id: string;
  case_id: string;
  case_number?: string;
  case_title?: string;
  document_number: string;
  title: string;
  doc_type: string;
  sensitivity: CaseSensitivity;
  version: number;
  content_text: string;
  sha256_hash: string;
  author_id: string;
  author_name?: string;
  author_badge?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  signed_by_id?: string | null;
  signer_name?: string | null;
  signer_badge?: string | null;
  signed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;
  case_id: string;
  case_number?: string;
  case_title?: string;
  event_timestamp: string;
  title: string;
  description: string;
  source_type: string;
  corroboration_level: 'UNVERIFIED' | 'CORROBORATED' | 'DEFINITIVE_RECORD';
  verified_by_id?: string;
  verifier_name?: string;
  is_verified: boolean;
  created_at: string;
}

export interface CaseReview {
  id: string;
  case_id: string;
  case_number?: string;
  case_title?: string;
  reviewer_id: string;
  reviewer_name?: string;
  reviewer_badge?: string;
  reviewer_role?: UserRole;
  review_type: string;
  decision: 'APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED' | 'FLAGGED_DEFICIENCY';
  comments: string;
  statutory_notes?: string;
  created_at: string;
}

export interface ReadinessItem {
  id: string;
  case_id: string;
  category: string;
  item_name: string;
  is_compliant: boolean;
  notes?: string;
  verified_by_id?: string;
  verified_by_name?: string;
  verified_at?: string;
}

export interface AuditLog {
  id: string;
  sequence_num: number;
  timestamp: string;
  user_id?: string;
  user_name?: string;
  user_badge?: string;
  user_role?: string;
  action: string;
  target_type: string;
  target_id?: string;
  case_id?: string;
  ip_address: string;
  details: Record<string, any>;
  status: 'SUCCESS' | 'DENIED' | 'SECURITY_ALERT';
  prev_hash: string;
  current_hash: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  case_id?: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ALERT' | 'CRITICAL';
  is_read: boolean;
  created_at: string;
}

export interface DashboardMetrics {
  totalCases: number;
  activeCases: number;
  pendingSupervisorReview: number;
  pendingLegalReview: number;
  totalEvidence: number;
  totalDocuments: number;
  securityAlerts: number;
}
