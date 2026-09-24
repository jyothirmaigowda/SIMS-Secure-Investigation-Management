import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Fingerprint,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

import { api } from '../../lib/api.ts';
import type { EvidenceItem } from '../../types.ts';
import {
  formatDateTime,
  truncateHash,
} from '../../lib/utils.ts';

interface EvidenceViewProps {
  onOpenCase: (caseId: string) => void;
  onOpenNewEvidence: () => void;
}

type CategoryFilter =
  | 'ALL'
  | EvidenceItem['category'];

type IntegrityState =
  | 'VERIFIED'
  | 'VIOLATION'
  | 'UNVERIFIED';

interface VerificationResult {
  id: string;
  verified: boolean;
  sha256Hash?: string;
  status?: string;
  message?: string;
}

interface CustodyRecord {
  id?: string;
  evidence_id?: string;
  case_id?: string;
  transferred_from_id?: string;
  transferred_to_id?: string;
  action_type?: string;
  reason?: string;
  location?: string;
  signature_hash?: string;
  recorded_at?: string;
  from_name?: string;
  from_badge?: string;
  to_name?: string;
  to_badge?: string;
}

function formatCategory(category: string) {
  return category
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return '—';
  }

  const units = ['B', 'KB', 'MB', 'GB'];

  let value = bytes;
  let unitIndex = 0;

  while (
    value >= 1024 &&
    unitIndex < units.length - 1
  ) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(
    value >= 10 || unitIndex === 0 ? 0 : 1
  )} ${units[unitIndex]}`;
}

function EvidenceBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?:
    | 'neutral'
    | 'green'
    | 'amber'
    | 'red'
    | 'blue';
}) {
  const classes = {
    neutral:
      'border-slate-200 bg-slate-50 text-slate-600',
    green:
      'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber:
      'border-amber-200 bg-amber-50 text-amber-700',
    red:
      'border-red-200 bg-red-50 text-red-700',
    blue:
      'border-blue-200 bg-blue-50 text-blue-700',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function getIntegrityState(
  item: EvidenceItem
): IntegrityState {
  if (item.is_tampered === true) {
    return 'VIOLATION';
  }

  /*
   * false means a verification has previously confirmed the
   * current file against its registered digest.
   *
   * undefined/null means that no successful verification state
   * is available yet.
   */
  if (item.is_tampered === false) {
    return 'VERIFIED';
  }

  return 'UNVERIFIED';
}

function IntegrityBadge({
  state,
}: {
  state: IntegrityState;
}) {
  if (state === 'VIOLATION') {
    return (
      <EvidenceBadge tone="red">
        Integrity violation
      </EvidenceBadge>
    );
  }

  if (state === 'VERIFIED') {
    return (
      <EvidenceBadge tone="green">
        SHA-256 verified
      </EvidenceBadge>
    );
  }

  return (
    <EvidenceBadge tone="amber">
      Not yet verified
    </EvidenceBadge>
  );
}

export const EvidenceView: React.FC<
  EvidenceViewProps
> = ({
  onOpenCase,
  onOpenNewEvidence,
}) => {
  const [evidence, setEvidence] =
    useState<EvidenceItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>('ALL');

  const [selectedEvidence, setSelectedEvidence] =
    useState<EvidenceItem | null>(null);

  const [custodyChain, setCustodyChain] =
    useState<CustodyRecord[]>([]);

  const [loadingDetail, setLoadingDetail] =
    useState(false);

  const [detailError, setDetailError] =
    useState('');

  const [verifyingId, setVerifyingId] =
    useState<string | null>(null);

  const [verifyResult, setVerifyResult] =
    useState<VerificationResult | null>(null);

  const [error, setError] =
    useState('');

  const loadEvidence = async (
    silent = false
  ) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const response =
        await api.getEvidence();

      setEvidence(
        (response.evidence || []) as EvidenceItem[]
      );
    } catch (err: any) {
      console.error(
        '[EVIDENCE] Fetch failed:',
        err
      );

      setError(
        err?.message ||
          'Unable to load the evidence register.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadEvidence();
  }, []);

  const filteredEvidence = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return evidence.filter((item) => {
      const matchesCategory =
        categoryFilter === 'ALL' ||
        item.category === categoryFilter;

      if (!matchesCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        item.tracking_number,
        item.title,
        item.description,
        item.sha256_hash,
        item.case_number,
        item.case_title,
        item.holder_name,
        item.holder_badge,
        item.storage_location,
        item.file_name,
        item.mime_type,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(query)
        );
    });
  }, [
    evidence,
    search,
    categoryFilter,
  ]);

  const handleSelectEvidence = async (
    item: EvidenceItem
  ) => {
    setSelectedEvidence(item);
    setCustodyChain([]);
    setDetailError('');
    setLoadingDetail(true);

    try {
      const response =
        await api.getEvidenceItem(item.id);

      setSelectedEvidence(
        response.evidence as EvidenceItem
      );

      /*
       * api.ts exposes custodyChain.
       * Do not reference custody_chain here because it
       * does not exist in the typed API response.
       */
      setCustodyChain(
        (response.custodyChain || []) as CustodyRecord[]
      );
    } catch (err: any) {
      console.error(
        '[EVIDENCE] Detail fetch failed:',
        err
      );

      setDetailError(
        err?.message ||
          'Custody history could not be loaded.'
      );

      setCustodyChain([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleVerifyHash = async (
    id: string
  ) => {
    setVerifyingId(id);
    setVerifyResult(null);

    try {
      const response =
        await api.verifyEvidenceHash(id);

      /*
       * api.ts exposes:
       * verified
       * sha256Hash
       * status
       * message
       *
       * There is no calculatedSha256 field in the
       * current API type, so we only store fields that
       * the API actually returns.
       */
      setVerifyResult({
        id,
        verified: response.verified,
        sha256Hash:
          response.sha256Hash,
        status:
          response.status,
        message:
          response.message,
      });

      /*
       * Only a successful server verification changes the
       * current integrity state.
       *
       * A transport/authentication error must NOT be treated
       * as evidence tampering.
       */
      setEvidence((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                is_tampered:
                  response.verified
                    ? false
                    : true,
              }
            : item
        )
      );

      setSelectedEvidence((current) =>
        current?.id === id
          ? {
              ...current,
              is_tampered:
                response.verified
                  ? false
                  : true,
            }
          : current
      );
    } catch (err: any) {
      console.error(
        '[EVIDENCE] Hash verification failed:',
        err
      );

      /*
       * Do NOT modify is_tampered here.
       * A failed API request is not proof of tampering.
       */
      setVerifyResult({
        id,
        verified: false,
        status:
          'VERIFICATION_NOT_COMPLETED',
        message:
          err?.message ||
          'Hash verification could not be completed. The current integrity state was not changed.',
      });
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDownloadEvidence = async (
    item: EvidenceItem
  ) => {
    if (!item.file_name) {
      alert(
        'No downloadable file is associated with this evidence record.'
      );
      return;
    }

    try {
      await api.downloadEvidence(
        item.id,
        item.file_name
      );
    } catch (err: any) {
      alert(
        err?.message ||
          'Evidence download failed.'
      );
    }
  };

  const totalEvidence =
    evidence.length;

  const integrityIssues =
    evidence.filter(
      (item) =>
        getIntegrityState(item) ===
        'VIOLATION'
    ).length;

  const digitalEvidence =
    evidence.filter(
      (item) =>
        item.category === 'DIGITAL'
    ).length;

  const verifiedEvidence =
    evidence.filter(
      (item) =>
        getIntegrityState(item) ===
        'VERIFIED'
    ).length;

  const unverifiedEvidence =
    evidence.filter(
      (item) =>
        getIntegrityState(item) ===
        'UNVERIFIED'
    ).length;

  return (
    <div className="space-y-6 pb-12">
      {/* ============================================================
          HEADER
      ============================================================ */}

      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-slate-700" />

            <h1 className="text-xl font-semibold tracking-tight text-slate-950">
              Evidence Vault
            </h1>
          </div>

          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Evidence register with controlled access,
            cryptographic integrity verification and
            chain-of-custody records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void loadEvidence(true)
            }
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Loader2
              className={`h-4 w-4 ${
                refreshing
                  ? 'animate-spin'
                  : ''
              }`}
            />

            {refreshing
              ? 'Refreshing'
              : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={onOpenNewEvidence}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Register Evidence
          </button>
        </div>
      </div>

      {/* ============================================================
          CONTROL STATUS
      ============================================================ */}

      <div className="flex flex-col gap-3 border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />

          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Evidence integrity controls
          </span>

          <span className="hidden text-xs text-slate-400 sm:inline">
            •
          </span>

          <span className="text-xs text-slate-500">
            SHA-256 verification available
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Secure vault access
        </div>
      </div>

      {/* ============================================================
          SUMMARY
      ============================================================ */}

      <div className="grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-5">
        <div className="bg-white p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Total evidence
          </div>

          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {totalEvidence}
          </div>
        </div>

        <div className="bg-white p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Digital
          </div>

          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {digitalEvidence}
          </div>
        </div>

        <div className="bg-white p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            SHA-256 verified
          </div>

          <div className="mt-2 text-2xl font-semibold text-emerald-700">
            {verifiedEvidence}
          </div>
        </div>

        <div className="bg-white p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Not yet verified
          </div>

          <div className="mt-2 text-2xl font-semibold text-amber-600">
            {unverifiedEvidence}
          </div>
        </div>

        <div className="bg-white p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Integrity issues
          </div>

          <div
            className={`mt-2 text-2xl font-semibold ${
              integrityIssues > 0
                ? 'text-red-600'
                : 'text-slate-900'
            }`}
          >
            {integrityIssues}
          </div>
        </div>
      </div>

      {/* ============================================================
          ERROR
      ============================================================ */}

      {error && (
        <div className="flex items-start gap-3 border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

          <div className="min-w-0">
            <div className="text-sm font-semibold text-red-900">
              Evidence register unavailable
            </div>

            <p className="mt-1 text-sm text-red-700">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadEvidence()
              }
              className="mt-3 text-sm font-medium text-red-800 underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* ============================================================
          SEARCH / FILTER
      ============================================================ */}

      <div className="border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search tracking number, title, case, hash or custodian..."
              aria-label="Search evidence register"
              className="w-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">
              Category
            </span>

            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target
                    .value as CategoryFilter
                )
              }
              aria-label="Filter evidence by category"
              className="border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
            >
              <option value="ALL">
                All categories
              </option>

              <option value="DIGITAL">
                Digital
              </option>

              <option value="PHYSICAL">
                Physical
              </option>

              <option value="FORENSIC">
                Forensic
              </option>

              <option value="DOCUMENTARY">
                Documentary
              </option>

              <option value="BIOLOGICAL">
                Biological
              </option>

              <option value="SURVEILLANCE">
                Surveillance
              </option>
            </select>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-400">
          Showing {filteredEvidence.length} of{' '}
          {evidence.length} evidence records
        </div>
      </div>

      {/* ============================================================
          VERIFICATION RESULT
      ============================================================ */}

      {verifyResult && (
        <div
          className={`border p-4 ${
            verifyResult.verified
              ? 'border-emerald-200 bg-emerald-50'
              : verifyResult.status ===
                'VERIFICATION_NOT_COMPLETED'
              ? 'border-amber-200 bg-amber-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              {verifyResult.verified ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              ) : verifyResult.status ===
                'VERIFICATION_NOT_COMPLETED' ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              )}

              <div className="min-w-0">
                <div
                  className={`text-sm font-semibold ${
                    verifyResult.verified
                      ? 'text-emerald-900'
                      : verifyResult.status ===
                        'VERIFICATION_NOT_COMPLETED'
                      ? 'text-amber-900'
                      : 'text-red-900'
                  }`}
                >
                  {verifyResult.verified
                    ? 'SHA-256 verification passed'
                    : verifyResult.status ===
                      'VERIFICATION_NOT_COMPLETED'
                    ? 'SHA-256 verification not completed'
                    : 'SHA-256 integrity violation detected'}
                </div>

                <p
                  className={`mt-1 text-sm ${
                    verifyResult.verified
                      ? 'text-emerald-700'
                      : verifyResult.status ===
                        'VERIFICATION_NOT_COMPLETED'
                      ? 'text-amber-700'
                      : 'text-red-700'
                  }`}
                >
                  {verifyResult.message ||
                    verifyResult.status ||
                    'Verification completed.'}
                </p>

                {verifyResult.sha256Hash && (
                  <div className="mt-2 break-all font-mono text-[11px] text-slate-500">
                    Registered: {verifyResult.sha256Hash}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              aria-label="Close verification result"
              onClick={() =>
                setVerifyResult(null)
              }
              className="rounded-lg p-1 text-slate-400 hover:bg-white/60 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================
          REGISTER
      ============================================================ */}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center border border-slate-200 bg-white">
          <div className="text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-500" />

            <p className="mt-3 text-sm text-slate-500">
              Loading evidence register…
            </p>
          </div>
        </div>
      ) : filteredEvidence.length === 0 ? (
        <div className="border border-dashed border-slate-300 bg-white p-12 text-center">
          <Fingerprint className="mx-auto h-8 w-8 text-slate-400" />

          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            No evidence records found
          </h3>

          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {evidence.length === 0
              ? 'No evidence records are currently available within your authorized investigation scope.'
              : 'Try changing the search or category filter.'}
          </p>

          {evidence.length === 0 &&
            !error && (
              <button
                type="button"
                onClick={onOpenNewEvidence}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" />
                Register Evidence
              </button>
            )}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredEvidence.map(
            (item) => {
              const isSelected =
                selectedEvidence?.id ===
                item.id;

              const integrityState =
                getIntegrityState(item);

              const hasFile =
                Boolean(
                  item.file_name
                );

              return (
                <article
                  key={item.id}
                  className={`border bg-white p-5 transition ${
                    isSelected
                      ? 'border-slate-400 ring-1 ring-slate-300'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top */}

                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-500">
                          {item.tracking_number}
                        </span>

                        <EvidenceBadge tone="neutral">
                          {formatCategory(
                            item.category
                          )}
                        </EvidenceBadge>

                        <IntegrityBadge
                          state={
                            integrityState
                          }
                        />
                      </div>

                      <h2 className="mt-2 text-base font-semibold text-slate-900">
                        {item.title}
                      </h2>

                      {item.case_number && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenCase(
                              item.case_id
                            )
                          }
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {item.case_number}

                          <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Description */}

                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                    {item.description ||
                      'No description recorded.'}
                  </p>

                  {/* Record details */}

                  <div className="mt-4 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2">
                    <div className="bg-slate-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Current custodian
                      </div>

                      <div className="mt-1 text-sm font-medium text-slate-800">
                        {item.holder_name ||
                          'Not recorded'}
                      </div>

                      {item.holder_badge && (
                        <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                          Badge{' '}
                          {item.holder_badge}
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Collected
                      </div>

                      <div className="mt-1 text-sm text-slate-800">
                        {formatDateTime(
                          item.collected_at
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Storage location
                      </div>

                      <div className="mt-1 truncate text-sm text-slate-800">
                        {item.storage_location ||
                          'Not recorded'}
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        File
                      </div>

                      <div className="mt-1 truncate text-sm text-slate-800">
                        {item.file_name ||
                          'No file attached'}
                      </div>

                      {item.file_size && (
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {formatBytes(
                            item.file_size
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hash */}

                  <div className="mt-4">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Registered SHA-256
                    </div>

                    <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-2">
                      <Fingerprint className="h-4 w-4 shrink-0 text-slate-400" />

                      <span
                        className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600"
                        title={
                          item.sha256_hash
                        }
                      >
                        {truncateHash(
                          item.sha256_hash,
                          18
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() =>
                        void handleVerifyHash(
                          item.id
                        )
                      }
                      disabled={
                        verifyingId ===
                        item.id
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {verifyingId ===
                      item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}

                      {verifyingId ===
                      item.id
                        ? 'Verifying…'
                        : 'Verify SHA-256'}
                    </button>

                    <div className="flex items-center gap-2">
                      {hasFile && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadEvidence(
                              item
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <FileText className="h-4 w-4" />
                          Download
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          void handleSelectEvidence(
                            item
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </article>
              );
            }
          )}
        </div>
      )}

      {/* ============================================================
          DETAIL PANEL
      ============================================================ */}

      {selectedEvidence && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close evidence details"
            onClick={() => {
              setSelectedEvidence(null);
              setCustodyChain([]);
              setDetailError('');
            }}
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]"
          />

          <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            {/* Panel header */}

            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">
                      {
                        selectedEvidence.tracking_number
                      }
                    </span>

                    <IntegrityBadge
                      state={getIntegrityState(
                        selectedEvidence
                      )}
                    />
                  </div>

                  <h2 className="mt-1 text-lg font-semibold text-slate-900">
                    {selectedEvidence.title}
                  </h2>
                </div>

                <button
                  type="button"
                  aria-label="Close evidence details"
                  onClick={() => {
                    setSelectedEvidence(
                      null
                    );
                    setCustodyChain([]);
                    setDetailError('');
                  }}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-6 p-5">
              {/* Case */}

              <section>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Associated case
                </div>

                {selectedEvidence.case_number ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenCase(
                        selectedEvidence.case_id
                      )
                    }
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {
                      selectedEvidence.case_number
                    }

                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No case number recorded.
                  </p>
                )}

                {selectedEvidence.case_title && (
                  <p className="mt-1 text-sm text-slate-600">
                    {
                      selectedEvidence.case_title
                    }
                  </p>
                )}
              </section>

              {/* Description */}

              <section>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Description
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {selectedEvidence.description ||
                    'No description recorded.'}
                </p>
              </section>

              {/* Integrity */}

              <section
                className={`border p-4 ${
                  getIntegrityState(
                    selectedEvidence
                  ) === 'VIOLATION'
                    ? 'border-red-200 bg-red-50/50'
                    : getIntegrityState(
                        selectedEvidence
                      ) === 'VERIFIED'
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {getIntegrityState(
                    selectedEvidence
                  ) === 'VIOLATION' ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  ) : getIntegrityState(
                      selectedEvidence
                    ) === 'VERIFIED' ? (
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        File integrity
                      </div>

                      <IntegrityBadge
                        state={getIntegrityState(
                          selectedEvidence
                        )}
                      />
                    </div>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {getIntegrityState(
                        selectedEvidence
                      ) === 'VIOLATION'
                        ? 'The latest verification indicates that the stored content does not match the registered digest.'
                        : getIntegrityState(
                            selectedEvidence
                          ) === 'VERIFIED'
                        ? 'The latest verification confirmed that the stored evidence bytes match the registered SHA-256 digest.'
                        : 'This evidence item has not yet received a successful current-byte SHA-256 verification.'}
                    </p>

                    <div className="mt-3 break-all border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] leading-5 text-slate-200">
                      {selectedEvidence.sha256_hash ||
                        'No registered SHA-256 digest'}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void handleVerifyHash(
                          selectedEvidence.id
                        )
                      }
                      disabled={
                        verifyingId ===
                        selectedEvidence.id
                      }
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {verifyingId ===
                      selectedEvidence.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}

                      {verifyingId ===
                      selectedEvidence.id
                        ? 'Verifying…'
                        : 'Verify current file'}
                    </button>
                  </div>
                </div>
              </section>

              {/* Evidence metadata */}

              <section>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Evidence record
                </div>

                <dl className="mt-3 divide-y divide-slate-100 border border-slate-200">
                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-xs text-slate-400">
                      Category
                    </dt>

                    <dd className="text-right text-sm text-slate-700">
                      {formatCategory(
                        selectedEvidence.category
                      )}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-xs text-slate-400">
                      File
                    </dt>

                    <dd className="max-w-[250px] truncate text-right text-sm text-slate-700">
                      {selectedEvidence.file_name ||
                        'No file attached'}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-xs text-slate-400">
                      MIME type
                    </dt>

                    <dd className="text-right text-sm text-slate-700">
                      {selectedEvidence.mime_type ||
                        '—'}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-xs text-slate-400">
                      File size
                    </dt>

                    <dd className="text-right text-sm text-slate-700">
                      {formatBytes(
                        selectedEvidence.file_size
                      )}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-xs text-slate-400">
                      Collected
                    </dt>

                    <dd className="text-right text-sm text-slate-700">
                      {formatDateTime(
                        selectedEvidence.collected_at
                      )}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-xs text-slate-400">
                      Collector
                    </dt>

                    <dd className="text-right text-sm text-slate-700">
                      {selectedEvidence.collector_name ||
                        '—'}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-xs text-slate-400">
                      Current custodian
                    </dt>

                    <dd className="text-right text-sm text-slate-700">
                      {selectedEvidence.holder_name ||
                        '—'}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-xs text-slate-400">
                      Storage
                    </dt>

                    <dd className="max-w-[250px] truncate text-right text-sm text-slate-700">
                      {selectedEvidence.storage_location ||
                        '—'}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Custody */}

              <section>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Chain of custody
                </div>

                {detailError && (
                  <div className="mt-3 flex items-start gap-2 border border-red-200 bg-red-50 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />

                    <p className="text-xs leading-5 text-red-700">
                      {detailError}
                    </p>
                  </div>
                )}

                {loadingDetail ? (
                  <div className="mt-3 border border-slate-200 p-6 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />

                    <p className="mt-2 text-xs text-slate-500">
                      Loading custody history…
                    </p>
                  </div>
                ) : custodyChain.length ===
                  0 ? (
                  <div className="mt-3 border border-dashed border-slate-300 bg-slate-50 p-5">
                    <p className="text-sm text-slate-500">
                      No custody transfers are
                      recorded for this evidence
                      item.
                    </p>
                  </div>
                ) : (
                  <div className="relative mt-3 space-y-3">
                    {custodyChain.map(
                      (
                        record,
                        index
                      ) => (
                        <div
                          key={
                            record.id ||
                            `${index}-${record.recorded_at}`
                          }
                          className="border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {formatCategory(
                                  record.action_type ||
                                    'CUSTODY_TRANSFER'
                                )}
                              </div>

                              <div className="mt-1 text-xs text-slate-400">
                                {formatDateTime(
                                  record.recorded_at
                                )}
                              </div>
                            </div>

                            <span className="font-mono text-[10px] text-slate-400">
                              #{index + 1}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2">
                            <div className="bg-slate-50 p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                From
                              </div>

                              <div className="mt-1 text-sm text-slate-700">
                                {record.from_name ||
                                  record.transferred_from_id ||
                                  '—'}
                              </div>

                              {record.from_badge && (
                                <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                                  Badge{' '}
                                  {
                                    record.from_badge
                                  }
                                </div>
                              )}
                            </div>

                            <div className="bg-slate-50 p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                To
                              </div>

                              <div className="mt-1 text-sm text-slate-700">
                                {record.to_name ||
                                  record.transferred_to_id ||
                                  '—'}
                              </div>

                              {record.to_badge && (
                                <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                                  Badge{' '}
                                  {
                                    record.to_badge
                                  }
                                </div>
                              )}
                            </div>
                          </div>

                          {record.location && (
                            <div className="mt-3 text-xs text-slate-500">
                              <span className="font-medium text-slate-600">
                                Location:
                              </span>{' '}
                              {record.location}
                            </div>
                          )}

                          {record.reason && (
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              {record.reason}
                            </p>
                          )}

                          {record.signature_hash && (
                            <div className="mt-3 break-all border-t border-slate-100 pt-3 font-mono text-[9px] leading-4 text-slate-400">
                              Custody record hash:{' '}
                              {
                                record.signature_hash
                              }
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </section>

              {/* Actions */}

              <section className="border-t border-slate-200 pt-5">
                <div className="flex flex-col gap-2">
                  {selectedEvidence.file_name && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownloadEvidence(
                          selectedEvidence
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      <FileText className="h-4 w-4" />
                      Download evidence file
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      onOpenCase(
                        selectedEvidence.case_id
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Open Case Workspace
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default EvidenceView;