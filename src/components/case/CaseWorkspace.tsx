import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  FolderOpen,
  GitBranch,
  History,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';

import { api } from '../../lib/api';
import type {
  AuditLog,
  CaseAssignment,
  CaseDocument,
  CaseItem,
  CaseReview,
  EvidenceItem,
  ReadinessItem,
  TimelineEvent,
  User,
} from '../../types';

interface CaseWorkspaceProps {
  caseId: string;
  currentUser?: User | any;
  onBack?: () => void;

  onOpenNewEvidence?: (caseId?: string) => void;
  onOpenNewDocument?: (caseId?: string) => void;
  onOpenNewTimeline?: (caseId?: string) => void;
  onOpenNewReview?: (caseId?: string) => void;
}

type TabKey =
  | 'overview'
  | 'investigation'
  | 'documents'
  | 'evidence'
  | 'custody'
  | 'timeline'
  | 'graph'
  | 'reports'
  | 'reviews'
  | 'audit'
  | 'integrity'
  | 'readiness'
  | 'certificates';

interface ReportItem {
  id: string;
  title: string;
  report_type?: string;
  content?: string;
  status?: string;
  version?: number;
  author_name?: string;
  created_at?: string;
  updated_at?: string;
  rejection_reason?: string;
}

interface CertificateItem {
  id: string;
  certifier_name?: string;
  certifier_title?: string;
  statement?: string;
  created_at?: string;
}

const TABS: Array<{
  id: TabKey;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'overview', label: 'Overview', icon: FolderOpen },
  { id: 'investigation', label: 'Investigation', icon: BookOpen },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'evidence', label: 'Evidence', icon: Fingerprint },
  { id: 'custody', label: 'Custody', icon: ShieldCheck },
  { id: 'timeline', label: 'Timeline', icon: Clock3 },
  { id: 'graph', label: 'Graph', icon: GitBranch },
  { id: 'reports', label: 'Reports', icon: FileCheck2 },
  { id: 'reviews', label: 'Reviews', icon: MessageSquare },
  { id: 'audit', label: 'Audit', icon: History },
  { id: 'integrity', label: 'Integrity', icon: ShieldCheck },
  { id: 'readiness', label: 'Readiness', icon: CheckCircle2 },
  { id: 'certificates', label: 'Certificates', icon: Archive },
];

function formatDate(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(value?: string) {
  if (!value) return 'Unknown';

  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(value?: string) {
  switch (value) {
    case 'CLOSED':
    case 'APPROVED':
    case 'CORROBORATED':
    case 'DEFINITIVE_RECORD':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';

    case 'SUPERVISOR_REVIEW':
    case 'LEGAL_REVIEW':
    case 'SUBMITTED':
    case 'CHANGES_REQUIRED':
      return 'bg-amber-50 text-amber-700 border-amber-200';

    case 'REJECTED':
    case 'FLAGGED_DEFICIENCY':
      return 'bg-red-50 text-red-700 border-red-200';

    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function sensitivityClass(value?: string) {
  switch (value) {
    case 'RESTRICTED':
      return 'bg-red-50 text-red-700 border-red-200';

    case 'SECRET':
      return 'bg-orange-50 text-orange-700 border-orange-200';

    case 'CONFIDENTIAL':
      return 'bg-amber-50 text-amber-700 border-amber-200';

    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function canWrite(user: User | any, assignments: CaseAssignment[]) {
  if (!user) return false;

  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') {
    return true;
  }

  return assignments.some(
    (assignment) =>
      assignment.user_id === user.id && assignment.can_write
  );
}

function canReview(user: User | any, assignments: CaseAssignment[]) {
  if (!user) return false;

  if (
    user.role === 'ADMIN' ||
    user.role === 'SUPERVISOR' ||
    user.role === 'LEGAL'
  ) {
    return true;
  }

  return assignments.some(
    (assignment) =>
      assignment.user_id === user.id && assignment.can_review
  );
}

function canExport(user: User | any, assignments: CaseAssignment[]) {
  if (!user) return false;

  if (user.role === 'ADMIN') return true;

  return assignments.some(
    (assignment) =>
      assignment.user_id === user.id && assignment.can_export
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>

      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>

      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {description}
      </p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {eyebrow}
          </div>
        )}

        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

        {description && (
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {description}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </span>

        <Icon className="h-4 w-4 text-slate-400" />
      </div>

      <div className="text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export function CaseWorkspace({
  caseId,
  currentUser,
  onBack,
  onOpenNewEvidence,
  onOpenNewDocument,
  onOpenNewTimeline,
  onOpenNewReview,
}: CaseWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const [caseData, setCaseData] = useState<CaseItem | null>(null);
  const [assignments, setAssignments] = useState<CaseAssignment[]>([]);
  const [readiness, setReadiness] = useState<ReadinessItem[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [diary, setDiary] = useState<any[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reviews, setReviews] = useState<CaseReview[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [integrity, setIntegrity] = useState<any>(null);
  const [certificates, setCertificates] = useState<CertificateItem[]>([]);

  const [selectedEvidence, setSelectedEvidence] =
    useState<EvidenceItem | null>(null);

  const [custodyChain, setCustodyChain] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');

  const [diaryText, setDiaryText] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportType, setReportType] = useState('INITIAL');
  const [reportContent, setReportContent] = useState('');

  const [showDiaryComposer, setShowDiaryComposer] = useState(false);
  const [showReportComposer, setShowReportComposer] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);

  const userCanWrite = canWrite(currentUser, assignments);
  const userCanReview = canReview(currentUser, assignments);
  const userCanExport = canExport(currentUser, assignments);

  const canVerifyAudit =
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'SUPERVISOR';

  const loadWorkspace = useCallback(
    async (silent = false) => {
      if (!caseId) return;

      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError('');

        const [
          caseResponse,
          evidenceResponse,
          documentResponse,
          timelineResponse,
          diaryResponse,
          reportResponse,
          reviewResponse,
          auditResponse,
          readinessResponse,
          certificateResponse,
          integrityResponse,
        ] = await Promise.all([
          api.getCase(caseId),
          api.getEvidence(caseId),
          api.getDocuments(caseId),
          api.getTimeline(caseId),
          api.getInvestigationDiary(caseId),
          api.getReports(caseId),
          api.getReviews(caseId),
          api.getAuditLogs(caseId, 100),
          api.getReadiness(caseId),
          api.getCertificates(caseId),
          api.getCaseIntegrity(caseId),
        ]);

        setCaseData(caseResponse.case as CaseItem);

        setAssignments(
          (caseResponse.assignments || []) as CaseAssignment[]
        );

        setEvidence(
          (evidenceResponse.evidence || []) as EvidenceItem[]
        );

        setDocuments(
          (documentResponse.documents || []) as CaseDocument[]
        );

        setTimeline(
          (timelineResponse.events || []) as TimelineEvent[]
        );

        setDiary(diaryResponse.entries || []);

        setReports(reportResponse.reports || []);

        setReviews(
          (reviewResponse.reviews || []) as CaseReview[]
        );

        setAuditLogs(
          (auditResponse.logs || []) as AuditLog[]
        );

        const readinessPayload: any = readinessResponse;

        const readinessItems =
          readinessPayload?.items ||
          readinessPayload?.readiness ||
          readinessPayload?.data ||
          [];

        setReadiness(readinessItems as ReadinessItem[]);

        setCertificates(
          certificateResponse.certificates || []
        );

        setIntegrity(integrityResponse);
      } catch (err: any) {
        console.error('[CASE WORKSPACE]', err);

        setError(
          err?.message ||
            'Unable to load this case workspace.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [caseId]
  );

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const filteredDocuments = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return documents;

    return documents.filter((document) =>
      [
        document.document_number,
        document.title,
        document.doc_type,
        document.status,
        document.author_name,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [documents, searchTerm]);

  const filteredEvidence = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return evidence;

    return evidence.filter((item) =>
      [
        item.tracking_number,
        item.title,
        item.category,
        item.storage_location,
        item.holder_name,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [evidence, searchTerm]);

  const filteredTimeline = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return timeline;

    return timeline.filter((event) =>
      [
        event.title,
        event.description,
        event.source_type,
        event.corroboration_level,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [timeline, searchTerm]);

  const readinessStats = useMemo(() => {
    const total = readiness.length;

    const compliant = readiness.filter(
      (item) => item.is_compliant
    ).length;

    return {
      total,
      compliant,
      outstanding: total - compliant,
    };
  }, [readiness]);

  const reviewPendingCount = useMemo(
    () =>
      reviews.filter(
        (review) =>
          review.decision === 'CHANGES_REQUIRED' ||
          review.decision === 'FLAGGED_DEFICIENCY'
      ).length,
    [reviews]
  );

  const latestActivity = useMemo(() => {
    const events = [
      ...timeline.map((item) => ({
        id: `timeline-${item.id}`,
        date: item.event_timestamp,
        title: item.title,
        description: item.description,
        type: 'Timeline',
      })),

      ...auditLogs.map((item) => ({
        id: `audit-${item.id}`,
        date: item.timestamp,
        title: statusLabel(item.action),
        description: `${item.target_type}${
          item.user_name ? ` · ${item.user_name}` : ''
        }`,
        type: 'Audit',
      })),

      ...documents.map((item) => ({
        id: `document-${item.id}`,
        date: item.updated_at,
        title: item.title,
        description: `Document ${item.document_number}`,
        type: 'Document',
      })),
    ];

    return events
      .filter((item) => item.date)
      .sort(
        (a, b) =>
          new Date(b.date).getTime() -
          new Date(a.date).getTime()
      )
      .slice(0, 8);
  }, [timeline, auditLogs, documents]);

  const handleSelectEvidence = async (
    item: EvidenceItem
  ) => {
    try {
      setSelectedEvidence(item);

      const response = await api.getEvidenceItem(item.id);

      setSelectedEvidence(
        response.evidence as EvidenceItem
      );

      setCustodyChain(response.custodyChain || []);
    } catch (err: any) {
      console.error('[EVIDENCE DETAIL]', err);
      setCustodyChain([]);
    }
  };

  const handleVerifyEvidence = async (
    item: EvidenceItem
  ) => {
    try {
      setActionLoading(true);

      const response =
        await api.verifyEvidenceHash(item.id);

      setEvidence((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                is_tampered: !response.verified,
              }
            : entry
        )
      );

      if (selectedEvidence?.id === item.id) {
        setSelectedEvidence((current) =>
          current
            ? {
                ...current,
                is_tampered: !response.verified,
              }
            : current
        );
      }
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to verify the evidence hash.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadEvidence = async (
    item: EvidenceItem
  ) => {
    try {
      const filename =
        item.file_name ||
        `${item.tracking_number || 'evidence-item'}`;

      await api.downloadEvidence(item.id, filename);
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to download this evidence item.'
      );
    }
  };

  const handleDownloadDocument = async (
    document: CaseDocument
  ) => {
    try {
      const filename =
        document.document_number ||
        'case-document';

      await api.downloadDocument(
        document.id,
        `${filename}.pdf`
      );
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to download this document.'
      );
    }
  };

  const handleDocumentDecision = async (
    document: CaseDocument,
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    if (!userCanReview) return;

    try {
      setActionLoading(true);

      await api.signDocument(
        document.id,
        decision
      );

      await loadWorkspace(true);
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to update the document review.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddDiaryEntry = async () => {
    if (!diaryText.trim() || !userCanWrite) return;

    try {
      setActionLoading(true);

      await api.addDiaryEntry({
        case_id: caseId,
        content: diaryText.trim(),
      });

      setDiaryText('');
      setShowDiaryComposer(false);

      await loadWorkspace(true);
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to add the investigation diary entry.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateReport = async () => {
    if (
      !reportTitle.trim() ||
      !reportContent.trim() ||
      !userCanWrite
    ) {
      return;
    }

    try {
      setActionLoading(true);

      await api.createReport({
        case_id: caseId,
        title: reportTitle.trim(),
        report_type: reportType,
        content: reportContent.trim(),
      });

      setReportTitle('');
      setReportContent('');
      setReportType('INITIAL');
      setShowReportComposer(false);

      await loadWorkspace(true);
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to create the report.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitReport = async (
    report: ReportItem
  ) => {
    if (!userCanWrite) return;

    try {
      setActionLoading(true);

      await api.submitReport(report.id);

      await loadWorkspace(true);
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to submit the report.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewReport = async (
    report: ReportItem,
    decision: string
  ) => {
    if (!userCanReview) return;

    try {
      let rejectionReason: string | undefined;

      if (
        decision === 'REJECTED' ||
        decision === 'CHANGES_REQUIRED'
      ) {
        rejectionReason =
          window.prompt(
            'Enter the reason for this decision:'
          ) || undefined;

        if (!rejectionReason) return;
      }

      setActionLoading(true);

      await api.reviewReport(
        report.id,
        decision,
        rejectionReason
      );

      await loadWorkspace(true);
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to review the report.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisposition = async (
    status: string
  ) => {
    if (
      currentUser?.role !== 'ADMIN' &&
      currentUser?.role !== 'SUPERVISOR'
    ) {
      return;
    }

    try {
      setActionLoading(true);

      await api.updateCaseDisposition(
        caseId,
        status
      );

      await loadWorkspace(true);
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to update the case status.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleReadinessChange = async (
    item: ReadinessItem,
    compliant: boolean
  ) => {
    if (!userCanWrite && !userCanReview) return;

    try {
      setActionLoading(true);

      await api.updateReadinessItem(
        caseId,
        item.id,
        compliant,
        item.notes
      );

      await loadWorkspace(true);
    } catch (err: any) {
      alert(
        err?.message ||
          'Unable to update the readiness item.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-500" />

          <p className="mt-3 text-sm text-slate-500">
            Loading case workspace…
          </p>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />

          <div>
            <h2 className="font-semibold text-red-900">
              Case workspace unavailable
            </h2>

            <p className="mt-1 text-sm text-red-700">
              {error ||
                'The requested case could not be loaded.'}
            </p>

            <button
              type="button"
              onClick={() => loadWorkspace()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1600px] px-6 py-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Cases
            </button>

            <button
              type="button"
              onClick={() => loadWorkspace(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  refreshing ? 'animate-spin' : ''
                }`}
              />
              Refresh
            </button>
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-500">
                  {caseData.case_number}
                </span>

                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(
                    caseData.status
                  )}`}
                >
                  {statusLabel(caseData.status)}
                </span>

                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${sensitivityClass(
                    caseData.sensitivity
                  )}`}
                >
                  <Lock className="mr-1 inline h-3 w-3" />
                  {statusLabel(caseData.sensitivity)}
                </span>

                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {statusLabel(caseData.priority)} priority
                </span>
              </div>

              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {caseData.title}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                {caseData.summary ||
                  'No case summary has been recorded.'}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                <span>
                  Jurisdiction:{' '}
                  <strong className="font-medium text-slate-700">
                    {caseData.jurisdiction}
                  </strong>
                </span>

                {caseData.location && (
                  <span>
                    Location:{' '}
                    <strong className="font-medium text-slate-700">
                      {caseData.location}
                    </strong>
                  </span>
                )}

                {caseData.statute_violation && (
                  <span>
                    Statute:{' '}
                    <strong className="font-medium text-slate-700">
                      {caseData.statute_violation}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            <div className="w-full shrink-0 lg:w-80">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Lead investigator
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200">
                    <UserRound className="h-5 w-5 text-slate-600" />
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {caseData.lead_io_name ||
                        'Assigned investigator'}
                    </div>

                    <div className="text-xs text-slate-500">
                      {caseData.lead_io_badge
                        ? `Badge ${caseData.lead_io_badge}`
                        : 'Investigation Officer'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat
              label="Evidence"
              value={evidence.length}
              icon={Fingerprint}
            />

            <Stat
              label="Documents"
              value={documents.length}
              icon={FileText}
            />

            <Stat
              label="Timeline"
              value={timeline.length}
              icon={Clock3}
            />

            <Stat
              label="Reviews"
              value={reviews.length}
              icon={MessageSquare}
            />

            <Stat
              label="Open findings"
              value={reviewPendingCount}
              icon={AlertTriangle}
            />

            <Stat
              label="Readiness"
              value={`${readinessStats.compliant}/${readinessStats.total}`}
              icon={CheckCircle2}
            />
          </div>
        </div>

        <div className="mx-auto max-w-[1600px] overflow-x-auto px-6">
          <div className="flex min-w-max gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition ${
                    active
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {error && (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>

            <button
              type="button"
              onClick={() => loadWorkspace()}
              className="text-sm font-medium text-amber-900 underline"
            >
              Retry
            </button>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <SectionHeader
              eyebrow="Investigation overview"
              title="Case at a glance"
              description="The current investigative state, people assigned to the case, and recent activity."
            />

            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Case information
                  </h3>

                  <span className="text-xs text-slate-400">
                    Updated {formatShortDate(caseData.updated_at)}
                  </span>
                </div>

                <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      FIR / Case number
                    </dt>

                    <dd className="mt-1 font-mono text-sm text-slate-800">
                      {caseData.case_number}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Incident date
                    </dt>

                    <dd className="mt-1 text-sm text-slate-800">
                      {formatShortDate(caseData.incident_date)}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Jurisdiction
                    </dt>

                    <dd className="mt-1 text-sm text-slate-800">
                      {caseData.jurisdiction}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Location
                    </dt>

                    <dd className="mt-1 text-sm text-slate-800">
                      {caseData.location || '—'}
                    </dd>
                  </div>

                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Applicable provision
                    </dt>

                    <dd className="mt-1 text-sm text-slate-800">
                      {caseData.statute_violation || '—'}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Assigned personnel
                  </h3>

                  <Users className="h-4 w-4 text-slate-400" />
                </div>

                <div className="mt-4 space-y-3">
                  {assignments.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No case assignments recorded.
                    </p>
                  ) : (
                    assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="rounded-lg border border-slate-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {assignment.full_name}
                            </div>

                            <div className="mt-0.5 text-xs text-slate-500">
                              {statusLabel(
                                assignment.assigned_role
                              )}{' '}
                              · Badge {assignment.badge_number}
                            </div>
                          </div>

                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500">
                            {assignment.user_role}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {assignment.can_read && (
                            <span className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                              Read
                            </span>
                          )}

                          {assignment.can_write && (
                            <span className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                              Write
                            </span>
                          )}

                          {assignment.can_review && (
                            <span className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                              Review
                            </span>
                          )}

                          {assignment.can_export && (
                            <span className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                              Export
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <SectionHeader
                title="Recent case activity"
                description="A combined view of investigative events, document activity, and technical audit entries."
              />

              {latestActivity.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No activity recorded"
                  description="Activity will appear here as investigation events, documents, and audited actions are recorded."
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {latestActivity.map((item) => (
                    <div
                      key={item.id}
                      className="flex gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-400" />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">
                            {item.title}
                          </span>

                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                            {item.type}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-slate-500">
                          {item.description}
                        </p>
                      </div>

                      <time className="shrink-0 text-xs text-slate-400">
                        {formatDate(item.date)}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Case progression
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Case disposition changes are restricted to
                    supervisory and administrative roles.
                  </p>
                </div>

                <select
                  value={caseData.status}
                  onChange={(event) =>
                    handleDisposition(event.target.value)
                  }
                  disabled={
                    actionLoading ||
                    (currentUser?.role !== 'SUPERVISOR' &&
                      currentUser?.role !== 'ADMIN')
                  }
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                >
                  <option value="DRAFT">Draft</option>

                  <option value="UNDER_INVESTIGATION">
                    Under Investigation
                  </option>

                  <option value="SUPERVISOR_REVIEW">
                    Supervisor Review
                  </option>

                  <option value="LEGAL_REVIEW">
                    Legal Review
                  </option>

                  <option value="INDICTMENT_READY">
                    Indictment Ready
                  </option>

                  <option value="CLOSED">Closed</option>

                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'investigation' && (
          <div className="space-y-6">
            <SectionHeader
              eyebrow="Investigation diary"
              title="Investigation record"
              description="Narrative investigative entries are kept separate from the technical audit trail."
              action={
                userCanWrite ? (
                  <button
                    type="button"
                    onClick={() =>
                      setShowDiaryComposer((value) => !value)
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add entry
                  </button>
                ) : null
              }
            />

            {showDiaryComposer && userCanWrite && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <label className="text-sm font-medium text-slate-800">
                  Investigation diary entry
                </label>

                <textarea
                  value={diaryText}
                  onChange={(event) =>
                    setDiaryText(event.target.value)
                  }
                  rows={5}
                  placeholder="Record the investigative action, observation, or development..."
                  className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />

                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setShowDiaryComposer(false)
                    }
                    className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleAddDiaryEntry}
                    disabled={
                      actionLoading ||
                      !diaryText.trim()
                    }
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Save entry
                  </button>
                </div>
              </div>
            )}

            {diary.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No diary entries"
                description="The investigation diary has no entries recorded for this case."
              />
            ) : (
              <div className="space-y-3">
                {diary.map((entry: any, index) => (
                  <article
                    key={entry.id || index}
                    className="rounded-xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {entry.author_name ||
                            entry.user_name ||
                            'Investigation entry'}
                        </div>

                        <div className="mt-1 text-xs text-slate-400">
                          {formatDate(
                            entry.created_at ||
                              entry.entry_timestamp
                          )}
                        </div>
                      </div>

                      <BookOpen className="h-4 w-4 text-slate-400" />
                    </div>

                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {entry.content ||
                        entry.description ||
                        'No content recorded.'}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Document management"
              title="Case documents"
              description="Versioned documents associated with this investigation."
              action={
                <div className="flex items-center gap-2">
                  {onOpenNewDocument && userCanWrite && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenNewDocument(caseId)
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      New document
                    </button>
                  )}

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

                    <input
                      value={searchTerm}
                      onChange={(event) =>
                        setSearchTerm(event.target.value)
                      }
                      placeholder="Search documents"
                      className="w-64 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
              }
            />

            {filteredDocuments.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents found"
                description="No documents match the current search or this case has no documents."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Document
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Type
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Version
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Status
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Author
                        </th>

                        <th className="px-5 py-3" />
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filteredDocuments.map((document) => (
                        <tr
                          key={document.id}
                          className="hover:bg-slate-50"
                        >
                          <td className="px-5 py-4">
                            <div className="font-mono text-xs text-slate-400">
                              {document.document_number}
                            </div>

                            <div className="mt-1 text-sm font-medium text-slate-900">
                              {document.title}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-600">
                            {statusLabel(document.doc_type)}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-600">
                            v{document.version}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClass(
                                document.status
                              )}`}
                            >
                              {statusLabel(document.status)}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-600">
                            {document.author_name || '—'}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadDocument(
                                    document
                                  )
                                }
                                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </button>

                              {userCanReview &&
                                document.status ===
                                  'SUBMITTED' && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={actionLoading}
                                      onClick={() =>
                                        handleDocumentDecision(
                                          document,
                                          'APPROVED'
                                        )
                                      }
                                      className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100"
                                      title="Approve"
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                    </button>

                                    <button
                                      type="button"
                                      disabled={actionLoading}
                                      onClick={() =>
                                        handleDocumentDecision(
                                          document,
                                          'REJECTED'
                                        )
                                      }
                                      className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100"
                                      title="Reject"
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </button>
                                  </>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'evidence' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Evidence vault"
              title="Evidence register"
              description="Evidence records, file integrity and current custody holder."
              action={
                <div className="flex items-center gap-2">
                  {onOpenNewEvidence && userCanWrite && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenNewEvidence(caseId)
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      Register evidence
                    </button>
                  )}

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

                    <input
                      value={searchTerm}
                      onChange={(event) =>
                        setSearchTerm(event.target.value)
                      }
                      placeholder="Search evidence"
                      className="w-64 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
              }
            />

            {filteredEvidence.length === 0 ? (
              <EmptyState
                icon={Fingerprint}
                title="No evidence found"
                description="No evidence items match the current search or this case has no registered evidence."
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredEvidence.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-xl border bg-white p-5 ${
                      selectedEvidence?.id === item.id
                        ? 'border-slate-400 ring-1 ring-slate-300'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-slate-400">
                          {item.tracking_number}
                        </div>

                        <h3 className="mt-1 text-sm font-semibold text-slate-900">
                          {item.title}
                        </h3>

                        <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                          {item.description}
                        </p>
                      </div>

                      {item.is_tampered ? (
                        <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                          Integrity issue
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                          Integrity OK
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Category
                        </div>

                        <div className="mt-1 text-sm text-slate-700">
                          {statusLabel(item.category)}
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Custodian
                        </div>

                        <div className="mt-1 text-sm text-slate-700">
                          {item.holder_name || '—'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        SHA-256
                      </div>

                      <div className="mt-1 break-all rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-200">
                        {item.sha256_hash}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectEvidence(item)
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        View custody
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() =>
                          handleVerifyEvidence(item)
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Verify hash
                      </button>

                      {item.file_name && (
                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadEvidence(item)
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'custody' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Chain of custody"
              title="Evidence custody history"
              description="Select an evidence item to inspect its recorded custody chain."
            />

            {!selectedEvidence ? (
              <EmptyState
                icon={ShieldCheck}
                title="Select evidence"
                description="Open an evidence item from the Evidence tab to inspect its custody history."
              />
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="font-mono text-xs text-slate-400">
                    {selectedEvidence.tracking_number}
                  </div>

                  <h3 className="mt-1 text-base font-semibold text-slate-900">
                    {selectedEvidence.title}
                  </h3>

                  <dl className="mt-5 space-y-4">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">
                        Current custodian
                      </dt>

                      <dd className="mt-1 text-sm text-slate-800">
                        {selectedEvidence.holder_name ||
                          '—'}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">
                        Storage location
                      </dt>

                      <dd className="mt-1 text-sm text-slate-800">
                        {selectedEvidence.storage_location}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">
                        Collected
                      </dt>

                      <dd className="mt-1 text-sm text-slate-800">
                        {formatDate(
                          selectedEvidence.collected_at
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Recorded transfers
                  </h3>

                  {custodyChain.length === 0 ? (
                    <div className="mt-5 rounded-lg bg-slate-50 p-5 text-sm text-slate-500">
                      No custody transfers are recorded for this item.
                    </div>
                  ) : (
                    <div className="mt-5 space-y-0">
                      {custodyChain.map(
                        (record: any, index) => (
                          <div
                            key={
                              record.id ||
                              `${index}-${record.recorded_at}`
                            }
                            className="relative flex gap-4 pb-6 last:pb-0"
                          >
                            {index <
                              custodyChain.length - 1 && (
                              <div className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />
                            )}

                            <div className="relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-white bg-slate-500 ring-1 ring-slate-300" />

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-medium text-slate-900">
                                  {statusLabel(
                                    record.action_type
                                  )}
                                </span>

                                <span className="text-xs text-slate-400">
                                  {formatDate(
                                    record.recorded_at
                                  )}
                                </span>
                              </div>

                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <div className="rounded-lg bg-slate-50 p-3">
                                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                                    From
                                  </div>

                                  <div className="mt-1 text-sm text-slate-700">
                                    {record.from_name ||
                                      record.transferred_from_id ||
                                      '—'}
                                  </div>
                                </div>

                                <div className="rounded-lg bg-slate-50 p-3">
                                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                                    To
                                  </div>

                                  <div className="mt-1 text-sm text-slate-700">
                                    {record.to_name ||
                                      record.transferred_to_id ||
                                      '—'}
                                  </div>
                                </div>
                              </div>

                              {record.reason && (
                                <p className="mt-2 text-sm text-slate-500">
                                  {record.reason}
                                </p>
                              )}

                              {record.signature_hash && (
                                <div className="mt-2 break-all font-mono text-[10px] text-slate-400">
                                  Record hash:{' '}
                                  {record.signature_hash}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Chronology"
              title="Forensic timeline"
              description="Events recorded against the investigation, including corroboration state."
              action={
                <div className="flex items-center gap-2">
                  {onOpenNewTimeline && userCanWrite && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenNewTimeline(caseId)
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      Add event
                    </button>
                  )}

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

                    <input
                      value={searchTerm}
                      onChange={(event) =>
                        setSearchTerm(event.target.value)
                      }
                      placeholder="Search timeline"
                      className="w-64 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
              }
            />

            {filteredTimeline.length === 0 ? (
              <EmptyState
                icon={Clock3}
                title="No timeline events"
                description="No investigation events have been recorded for this case."
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="space-y-0">
                  {filteredTimeline
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(
                          b.event_timestamp
                        ).getTime() -
                        new Date(
                          a.event_timestamp
                        ).getTime()
                    )
                    .map((event, index) => (
                      <div
                        key={event.id}
                        className="relative flex gap-5 pb-7 last:pb-0"
                      >
                        {index <
                          filteredTimeline.length - 1 && (
                          <div className="absolute left-[9px] top-5 h-full w-px bg-slate-200" />
                        )}

                        <div
                          className={`relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-white ring-1 ${
                            event.is_verified
                              ? 'bg-emerald-500 ring-emerald-200'
                              : 'bg-slate-400 ring-slate-200'
                          }`}
                        >
                          {event.is_verified && (
                            <CheckCircle2 className="h-3 w-3 text-white" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900">
                                {event.title}
                              </h3>

                              <div className="mt-1 text-xs text-slate-400">
                                {formatDate(
                                  event.event_timestamp
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              <span
                                className={`rounded-full border px-2 py-1 text-[10px] font-medium ${statusClass(
                                  event.corroboration_level
                                )}`}
                              >
                                {statusLabel(
                                  event.corroboration_level
                                )}
                              </span>

                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500">
                                {statusLabel(
                                  event.source_type
                                )}
                              </span>
                            </div>
                          </div>

                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {event.description}
                          </p>

                          {event.verifier_name && (
                            <div className="mt-3 text-xs text-slate-400">
                              Verified by {event.verifier_name}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'graph' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Investigation relationships"
              title="Case relationship graph"
              description="A relationship view of the records already present in this case."
            />

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                    <FolderOpen className="h-5 w-5 text-slate-600" />
                  </div>

                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Case
                  </div>

                  <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                    {caseData.case_number}
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    {caseData.title}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                    <Fingerprint className="h-5 w-5 text-slate-600" />
                  </div>

                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Evidence nodes
                  </div>

                  <div className="mt-1 text-2xl font-semibold text-slate-900">
                    {evidence.length}
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    Registered evidence records
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                    <FileText className="h-5 w-5 text-slate-600" />
                  </div>

                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Document nodes
                  </div>

                  <div className="mt-1 text-2xl font-semibold text-slate-900">
                    {documents.length}
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    Versioned case documents
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8">
                <div className="mx-auto max-w-2xl text-center">
                  <GitBranch className="mx-auto h-8 w-8 text-slate-400" />

                  <h3 className="mt-3 text-sm font-semibold text-slate-900">
                    Relationship data
                  </h3>

                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    The current frontend API exposes case, evidence,
                    document, timeline and review records, but it does
                    not expose a dedicated graph-node or graph-edge
                    endpoint. This view therefore shows only relationships
                    that can be derived safely from those records rather
                    than inventing connections.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Case reporting"
              title="Investigation reports"
              description="Draft, submit and review reports without replacing the underlying case record."
              action={
                userCanWrite ? (
                  <button
                    type="button"
                    onClick={() =>
                      setShowReportComposer(
                        (value) => !value
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    New report
                  </button>
                ) : null
              }
            />

            {showReportComposer && userCanWrite && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-800">
                      Report title
                    </label>

                    <input
                      value={reportTitle}
                      onChange={(event) =>
                        setReportTitle(
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                      placeholder="Investigation report title"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-800">
                      Report type
                    </label>

                    <select
                      value={reportType}
                      onChange={(event) =>
                        setReportType(
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      <option value="INITIAL">
                        Initial Report
                      </option>

                      <option value="SUPPLEMENTAL">
                        Supplemental Report
                      </option>

                      <option value="CLOSING">
                        Closing Report
                      </option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-sm font-medium text-slate-800">
                    Report content
                  </label>

                  <textarea
                    value={reportContent}
                    onChange={(event) =>
                      setReportContent(
                        event.target.value
                      )
                    }
                    rows={10}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-slate-400"
                    placeholder="Enter the report content..."
                  />
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setShowReportComposer(false)
                    }
                    className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={
                      actionLoading ||
                      !reportTitle.trim() ||
                      !reportContent.trim()
                    }
                    onClick={handleCreateReport}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Create report
                  </button>
                </div>
              </div>
            )}

            {reports.length === 0 ? (
              <EmptyState
                icon={FileCheck2}
                title="No reports"
                description="No investigation reports have been created for this case."
              />
            ) : (
              <div className="space-y-4">
                {reports.map((report) => (
                  <article
                    key={report.id}
                    className="rounded-xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {report.title}
                          </h3>

                          {report.status && (
                            <span
                              className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClass(
                                report.status
                              )}`}
                            >
                              {statusLabel(
                                report.status
                              )}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span>
                            {statusLabel(
                              report.report_type
                            )}
                          </span>

                          {report.version && (
                            <span>
                              Version {report.version}
                            </span>
                          )}

                          <span>
                            {formatDate(
                              report.updated_at ||
                                report.created_at
                            )}
                          </span>

                          {report.author_name && (
                            <span>
                              Author: {report.author_name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {report.status === 'DRAFT' &&
                          userCanWrite && (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() =>
                                handleSubmitReport(
                                  report
                                )
                              }
                              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                            >
                              Submit
                            </button>
                          )}

                        {userCanReview &&
                          report.status ===
                            'SUBMITTED' && (
                            <>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() =>
                                  handleReviewReport(
                                    report,
                                    'APPROVED'
                                  )
                                }
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
                              >
                                Approve
                              </button>

                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() =>
                                  handleReviewReport(
                                    report,
                                    'CHANGES_REQUIRED'
                                  )
                                }
                                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
                              >
                                Request changes
                              </button>

                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() =>
                                  handleReviewReport(
                                    report,
                                    'REJECTED'
                                  )
                                }
                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
                              >
                                Reject
                              </button>
                            </>
                          )}
                      </div>
                    </div>

                    {report.content && (
                      <div className="mt-5 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                        {report.content}
                      </div>
                    )}

                    {report.rejection_reason && (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-red-600">
                          Decision note
                        </div>

                        <p className="mt-1 text-sm text-red-800">
                          {report.rejection_reason}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Review workflow"
              title="Case reviews"
              description="Supervisor and legal review decisions recorded against the case."
              action={
                onOpenNewReview && userCanReview ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenNewReview(caseId)
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    New review
                  </button>
                ) : null
              }
            />

            {reviews.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No reviews recorded"
                description="Review decisions will appear here when submitted through the review workflow."
              />
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <article
                    key={review.id}
                    className="rounded-xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {review.reviewer_name ||
                              'Reviewer'}
                          </h3>

                          {review.reviewer_role && (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500">
                              {review.reviewer_role}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-slate-400">
                          {statusLabel(
                            review.review_type
                          )}{' '}
                          · {formatDate(review.created_at)}
                        </div>
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(
                          review.decision
                        )}`}
                      >
                        {statusLabel(review.decision)}
                      </span>
                    </div>

                    <div className="mt-4 rounded-lg bg-slate-50 p-4">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {review.comments ||
                          'No review comments recorded.'}
                      </p>
                    </div>

                    {review.statutory_notes && (
                      <div className="mt-3 border-l-2 border-slate-300 pl-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Statutory notes
                        </div>

                        <p className="mt-1 text-sm text-slate-600">
                          {review.statutory_notes}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Technical audit"
              title="Case audit trail"
              description="Technical access and mutation records. This is separate from the investigation diary."
              action={
                canVerifyAudit ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const response =
                          await api.verifyAuditChain();

                        alert(
                          response.verified
                            ? `Audit chain verified. ${response.totalRecords} records checked.`
                            : `Audit verification failed: ${response.reason}`
                        );
                      } catch (err: any) {
                        alert(
                          err?.message ||
                            'Unable to verify the audit chain.'
                        );
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Verify chain
                  </button>
                ) : null
              }
            />

            {auditLogs.length === 0 ? (
              <EmptyState
                icon={History}
                title="No audit records"
                description="No technical audit entries are available for this case."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Seq.
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Time
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Actor
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Action
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Target
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50"
                        >
                          <td className="px-5 py-4 font-mono text-xs text-slate-400">
                            {log.sequence_num}
                          </td>

                          <td className="px-5 py-4 text-xs text-slate-500">
                            {formatDate(log.timestamp)}
                          </td>

                          <td className="px-5 py-4">
                            <div className="text-sm text-slate-800">
                              {log.user_name || 'System'}
                            </div>

                            {log.user_role && (
                              <div className="text-[10px] uppercase text-slate-400">
                                {log.user_role}
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4 text-sm font-medium text-slate-800">
                            {statusLabel(log.action)}
                          </td>

                          <td className="px-5 py-4">
                            <div className="text-xs text-slate-700">
                              {log.target_type}
                            </div>

                            {log.target_id && (
                              <div className="mt-0.5 max-w-[220px] truncate font-mono text-[10px] text-slate-400">
                                {log.target_id}
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full border px-2 py-1 text-xs font-medium ${
                                log.status === 'SUCCESS'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : log.status ===
                                      'DENIED'
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}
                            >
                              {statusLabel(log.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'integrity' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Independent provenance"
              title="Integrity anchors"
              description="Confidential files remain in the encrypted vault. This development ledger contains cryptographic hashes and provenance references only."
              action={
                <button
                  type="button"
                  onClick={() => loadWorkspace(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Verify integrity
                </button>
              }
            />

            <div className={`rounded-xl border p-5 ${integrity?.verified ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center gap-3">
                {integrity?.verified ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {integrity?.verified ? 'Ledger chain verified' : 'Ledger verification unavailable or failed'}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">{integrity?.label || 'Integrity status is loading.'}</div>
                </div>
              </div>
              {integrity && <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><span className="text-slate-500">Confirmed</span><div className="font-semibold">{integrity.confirmedCount}</div></div><div><span className="text-slate-500">Pending</span><div className="font-semibold">{integrity.pendingCount}</div></div><div><span className="text-slate-500">Provider</span><div className="font-semibold">{integrity.provider}</div></div></div>}
            </div>

            {!integrity?.records?.length ? <EmptyState icon={ShieldCheck} title="No integrity anchors yet" description="New document versions, evidence registrations, custody transfers, and timeline events are anchored after they are committed." /> : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="divide-y divide-slate-100">
                  {integrity.records.map((record: any) => <div key={record.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium text-slate-900">{statusLabel(record.event_type)}</div><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${record.status === 'CONFIRMED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{statusLabel(record.status)}</span></div><div className="mt-2 grid gap-1 font-mono text-[11px] text-slate-500"><span>Reference: {record.transaction_reference}</span><span>SHA-256: {record.sha256_hash}</span></div></div>)}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'readiness' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Workflow readiness"
              title="Investigation readiness"
              description="A checklist of recorded requirements and outstanding items. This is a workflow indicator, not a determination of legal admissibility."
            />

            <div className="grid gap-4 md:grid-cols-3">
              <Stat
                label="Total items"
                value={readinessStats.total}
                icon={FileCheck2}
              />

              <Stat
                label="Compliant"
                value={readinessStats.compliant}
                icon={CheckCircle2}
              />

              <Stat
                label="Outstanding"
                value={readinessStats.outstanding}
                icon={AlertTriangle}
              />
            </div>

            {readiness.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No readiness items"
                description="No readiness checklist has been recorded for this case."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="divide-y divide-slate-100">
                  {readiness.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-4 p-5 md:flex-row md:items-center"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          item.is_compliant
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-amber-50 text-amber-600'
                        }`}
                      >
                        {item.is_compliant ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {item.category}
                        </div>

                        <div className="mt-1 text-sm font-medium text-slate-900">
                          {item.item_name}
                        </div>

                        {item.notes && (
                          <p className="mt-1 text-sm text-slate-500">
                            {item.notes}
                          </p>
                        )}

                        {item.verified_by_name && (
                          <div className="mt-2 text-xs text-slate-400">
                            Verified by{' '}
                            {item.verified_by_name}
                            {item.verified_at
                              ? ` · ${formatDate(
                                  item.verified_at
                                )}`
                              : ''}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={
                          actionLoading ||
                          (!userCanWrite &&
                            !userCanReview)
                        }
                        onClick={() =>
                          handleReadinessChange(
                            item,
                            !item.is_compliant
                          )
                        }
                        className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium ${
                          item.is_compliant
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        } disabled:opacity-50`}
                      >
                        {item.is_compliant
                          ? 'Mark outstanding'
                          : 'Mark compliant'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'certificates' && (
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Electronic records"
              title="Certificates"
              description="Recorded certificate information associated with this case."
            />

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

                <div>
                  <div className="text-sm font-semibold text-amber-900">
                    Certificate records are not automatic legal filings
                  </div>

                  <p className="mt-1 text-sm leading-6 text-amber-800">
                    These records capture certificate information in the
                    system. They do not by themselves establish statutory
                    compliance, authenticity, admissibility, or acceptance
                    by a court.
                  </p>
                </div>
              </div>
            </div>

            {certificates.length === 0 ? (
              <EmptyState
                icon={FileCheck2}
                title="No certificates recorded"
                description="No electronic-record certificate entries are associated with this case."
              />
            ) : (
              <div className="space-y-4">
                {certificates.map((certificate) => (
                  <article
                    key={certificate.id}
                    className="rounded-xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {certificate.certifier_name ||
                            'Certifier not recorded'}
                        </h3>

                        <p className="mt-1 text-xs text-slate-400">
                          {certificate.certifier_title ||
                            'Title not recorded'}
                          {' · '}
                          {formatDate(
                            certificate.created_at
                          )}
                        </p>
                      </div>

                      <FileCheck2 className="h-5 w-5 text-slate-400" />
                    </div>

                    <div className="mt-4 rounded-lg bg-slate-50 p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Statement
                      </div>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {certificate.statement ||
                          'No statement recorded.'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {selectedEvidence && activeTab !== 'custody' && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
          <div className="mx-auto max-w-[1600px] px-6 py-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                  Selected evidence
                </div>

                <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {selectedEvidence.tracking_number} ·{' '}
                  {selectedEvidence.title}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  Custodian:{' '}
                  {selectedEvidence.holder_name || '—'}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('custody')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  View custody
                  <ChevronRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedEvidence(null)
                  }
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                  title="Close"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {actionLoading && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating case…
        </div>
      )}
    </div>
  );
}

export default CaseWorkspace;
