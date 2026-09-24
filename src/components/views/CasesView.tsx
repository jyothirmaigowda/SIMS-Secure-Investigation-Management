import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderLock,
  Plus,
  Search,
  Filter,
  Shield,
  Building2,
  Lock,
  FileText,
  RefreshCw,
  ChevronRight,
  ClipboardList,
} from 'lucide-react';

import { api } from '../../lib/api.ts';
import { CaseItem } from '../../types.ts';
import { formatDateTime } from '../../lib/utils.ts';

interface CasesViewProps {
  onOpenCase: (caseId: string) => void;
  onOpenNewCase: () => void;
}

export const CasesView: React.FC<CasesViewProps> = ({
  onOpenCase,
  onOpenNewCase,
}) => {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sensitivityFilter, setSensitivityFilter] = useState('ALL');

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.getCases();

      setCases(Array.isArray(res.cases) ? res.cases : []);
    } catch (err) {
      console.error('Error fetching cases:', err);

      setCases([]);
      setError(
        'The authorized case registry could not be retrieved. Please refresh and try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const filtered = cases.filter((c) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      !query ||
      c.case_number?.toLowerCase().includes(query) ||
      c.title?.toLowerCase().includes(query) ||
      c.summary?.toLowerCase().includes(query) ||
      c.jurisdiction?.toLowerCase().includes(query) ||
      c.lead_io_name?.toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === 'ALL' || c.status === statusFilter;

    const matchesSensitivity =
      sensitivityFilter === 'ALL' || c.sensitivity === sensitivityFilter;

    return matchesSearch && matchesStatus && matchesSensitivity;
  });

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter !== 'ALL' ||
    sensitivityFilter !== 'ALL';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setSensitivityFilter('ALL');
  };

  const getSensitivityBadge = (sens: string) => {
    switch (sens) {
      case 'RESTRICTED':
        return 'bg-red-50 text-red-700 border-red-200';

      case 'SECRET':
        return 'bg-amber-50 text-amber-800 border-amber-200';

      case 'CONFIDENTIAL':
        return 'bg-blue-50 text-blue-700 border-blue-200';

      case 'STANDARD':
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'UNDER_INVESTIGATION':
        return 'bg-blue-50 text-blue-700 border-blue-200';

      case 'SUPERVISOR_REVIEW':
        return 'bg-amber-50 text-amber-800 border-amber-200';

      case 'LEGAL_REVIEW':
        return 'bg-purple-50 text-purple-700 border-purple-200';

      case 'INDICTMENT_READY':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';

      case 'CLOSED':
        return 'bg-slate-100 text-slate-600 border-slate-200';

      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getStatusLabel = (status: string) => {
    return String(status || 'UNKNOWN').replace(/_/g, ' ');
  };

  return (
    <div className="space-y-5 pb-12">
      {/* ============================================================
          PAGE HEADER
      ============================================================ */}

      <section className="bg-white border border-slate-300">
        <div className="px-5 md:px-6 py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <ClipboardList className="w-4 h-4 text-[#163a5f]" />

              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#163a5f]">
                Investigation Records
              </span>

              <span className="text-slate-300">/</span>

              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Case Registry
              </span>
            </div>

            <h1 className="text-xl md:text-2xl font-bold text-[#102a43] tracking-tight">
              Case Management
            </h1>

            <p className="text-xs text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
              Authorized register of investigation cases available to the
              current officer and institutional workspace.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadCases()}
              disabled={loading}
              className="w-9 h-9 flex items-center justify-center border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50 transition-colors"
              title="Refresh case registry"
              aria-label="Refresh case registry"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  loading ? 'animate-spin' : ''
                }`}
              />
            </button>

            <button
              type="button"
              onClick={onOpenNewCase}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#163a5f] hover:bg-[#102a43] text-white text-[10px] font-bold uppercase tracking-wide transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Register New Case
            </button>
          </div>
        </div>

        {/* Registry status strip */}
        <div className="px-5 md:px-6 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Authorized Registry
          </span>

          <span className="text-slate-300">|</span>

          <span className="text-[9px] font-mono text-slate-500">
            RECORDS: {filtered.length}
          </span>

          <span className="text-[9px] font-mono text-slate-500">
            TOTAL: {cases.length}
          </span>

          <span className="ml-auto inline-flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
            <Lock className="w-3 h-3 text-[#163a5f]" />
            ACCESS CONTROLLED
          </span>
        </div>
      </section>

      {/* ============================================================
          FILTER / SEARCH BAR
      ============================================================ */}

      <section className="bg-white border border-slate-300">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-[#163a5f]" />

          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[#102a43]">
            Registry Search & Filters
          </span>
        </div>

        <div className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(260px,1fr)_auto_auto] gap-3">
          {/* Search */}
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />

            <input
              type="text"
              placeholder="Search case number, title, jurisdiction or lead officer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-white border border-slate-300 text-xs text-slate-800 placeholder:text-slate-400 font-mono focus:outline-none focus:border-[#163a5f] focus:ring-1 focus:ring-[#163a5f]/10"
              aria-label="Search case registry"
            />
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 min-w-0">
            <label
              htmlFor="case-status-filter"
              className="text-[9px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap"
            >
              Status
            </label>

            <select
              id="case-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-3 w-full sm:min-w-[175px] bg-white border border-slate-300 text-[10px] font-mono text-slate-700 focus:outline-none focus:border-[#163a5f]"
            >
              <option value="ALL">All Statuses</option>
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
            </select>
          </div>

          {/* Classification */}
          <div className="flex items-center gap-2 min-w-0">
            <label
              htmlFor="case-sensitivity-filter"
              className="text-[9px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap"
            >
              Classification
            </label>

            <select
              id="case-sensitivity-filter"
              value={sensitivityFilter}
              onChange={(e) => setSensitivityFilter(e.target.value)}
              className="h-10 px-3 w-full sm:min-w-[175px] bg-white border border-slate-300 text-[10px] font-mono text-slate-700 focus:outline-none focus:border-[#163a5f]"
            >
              <option value="ALL">All Classifications</option>
              <option value="STANDARD">Standard</option>
              <option value="CONFIDENTIAL">Confidential</option>
              <option value="SECRET">Secret</option>
              <option value="RESTRICTED">Restricted</option>
            </select>
          </div>
        </div>

        {hasFilters && (
          <div className="px-4 pb-3 flex items-center justify-between gap-4">
            <span className="text-[9px] font-mono text-slate-500">
              FILTERED RESULTS: {filtered.length}
            </span>

            <button
              type="button"
              onClick={clearFilters}
              className="text-[9px] font-bold uppercase tracking-wide text-[#163a5f] hover:underline shrink-0"
            >
              Clear Filters
            </button>
          </div>
        )}
      </section>

      {/* ============================================================
          REGISTRY ERROR
      ============================================================ */}

      {error && (
        <section
          role="alert"
          className="border border-red-200 bg-red-50 px-4 py-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-red-800">
                Registry Retrieval Failed
              </div>

              <p className="text-[10px] text-red-700 mt-1 leading-relaxed">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadCases()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-red-300 bg-white hover:bg-red-100 text-[9px] font-bold uppercase tracking-wide text-red-800 disabled:opacity-50 shrink-0"
            >
              <RefreshCw
                className={`w-3 h-3 ${
                  loading ? 'animate-spin' : ''
                }`}
              />
              Retry
            </button>
          </div>
        </section>
      )}

      {/* ============================================================
          CASE REGISTER
      ============================================================ */}

      <section className="bg-white border border-slate-300">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <FolderLock className="w-4 h-4 text-[#163a5f] shrink-0" />

            <div className="min-w-0">
              <h2 className="text-xs font-black uppercase tracking-[0.1em] text-[#102a43]">
                Investigation Case Register
              </h2>

              <p className="text-[9px] text-slate-500 mt-1">
                Select a record to open its controlled case workspace.
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[9px] font-mono text-slate-500 shrink-0">
            <FileText className="w-3.5 h-3.5" />
            {filtered.length} RECORD{filtered.length === 1 ? '' : 'S'}
          </div>
        </div>

        {loading ? (
          <div className="min-h-[280px] flex items-center justify-center">
            <div className="text-center">
              <div className="w-9 h-9 border-2 border-[#163a5f] border-t-transparent rounded-full animate-spin mx-auto" />

              <p className="mt-4 text-[9px] font-mono uppercase tracking-[0.14em] text-slate-500">
                Retrieving authorized case records
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="min-h-[220px] flex items-center justify-center px-5">
            <div className="text-center max-w-sm">
              <FolderLock className="w-9 h-9 text-red-200 mx-auto" />

              <h3 className="text-xs font-bold text-slate-700 mt-3">
                Case registry unavailable
              </h3>

              <p className="text-[10px] text-slate-500 leading-relaxed mt-1.5">
                The system could not retrieve the authorized case records.
                Retry the request before continuing.
              </p>

              <button
                type="button"
                onClick={() => void loadCases()}
                className="mt-4 inline-flex items-center gap-2 px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-[#163a5f]"
              >
                <RefreshCw className="w-3 h-3" />
                Retry Registry
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="min-h-[280px] flex items-center justify-center px-5">
            <div className="text-center max-w-sm">
              <FolderLock className="w-9 h-9 text-slate-300 mx-auto" />

              <h3 className="text-xs font-bold text-slate-700 mt-3">
                No matching case records
              </h3>

              <p className="text-[10px] text-slate-500 leading-relaxed mt-1.5">
                No authorized cases match the current search and filter
                criteria.
              </p>

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-[#163a5f]"
                >
                  Clear Registry Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filtered.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => onOpenCase(c.id)}
                className="w-full text-left px-5 py-4 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#163a5f] transition-colors group"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Main record information */}
                  <div className="min-w-0 flex-1">
                    {/* Record metadata */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#f3f7fb] border border-[#cbd8e5] text-[10px] font-mono font-black text-[#163a5f]">
                        <FolderLock className="w-3 h-3" />
                        {c.case_number}
                      </span>

                      <span
                        className={`px-2 py-1 border text-[8px] font-mono font-bold ${getSensitivityBadge(
                          c.sensitivity
                        )}`}
                      >
                        {c.sensitivity}
                      </span>

                      <span
                        className={`px-2 py-1 border text-[8px] font-mono font-bold ${getStatusBadge(
                          c.status
                        )}`}
                      >
                        {getStatusLabel(c.status)}
                      </span>

                      {c.jurisdiction && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-500">
                          <Building2 className="w-3 h-3" />
                          {c.jurisdiction}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-bold text-slate-900 mt-3 group-hover:text-[#163a5f] transition-colors">
                      {c.title}
                    </h3>

                    {/* Summary */}
                    {c.summary && (
                      <p className="text-[10px] text-slate-500 leading-relaxed mt-1.5 max-w-4xl line-clamp-2">
                        {c.summary}
                      </p>
                    )}

                    {/* Case details */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                        <span className="text-[9px] uppercase tracking-wide text-slate-400">
                          Lead IO
                        </span>

                        <span className="text-[9px] font-semibold text-slate-700 truncate">
                          {c.lead_io_name || 'Not assigned'}
                        </span>

                        {c.lead_io_badge && (
                          <span className="text-[8px] font-mono text-slate-400 shrink-0">
                            ({c.lead_io_badge})
                          </span>
                        )}
                      </div>

                      {c.statute_violation && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ScaleIcon />

                          <span className="text-[9px] uppercase tracking-wide text-slate-400">
                            Statute
                          </span>

                          <span className="text-[9px] text-slate-600 truncate max-w-xs">
                            {c.statute_violation}
                          </span>
                        </div>
                      )}

                      {c.incident_date && (
                        <div className="text-[9px] font-mono text-slate-500">
                          INCIDENT:{' '}
                          <span className="text-slate-700">
                            {formatDateTime(c.incident_date).slice(0, 16)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Open action */}
                  <div className="shrink-0 flex items-center justify-end lg:pt-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white group-hover:border-[#163a5f] group-hover:bg-[#f3f7fb] text-[9px] font-bold uppercase tracking-wide text-[#163a5f] transition-colors">
                      Open Workspace
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ============================================================
          ACCESS NOTICE
      ============================================================ */}

      <section className="border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-[#163a5f] mt-0.5 shrink-0" />

            <div>
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-700">
                Controlled Case Access
              </div>

              <div className="text-[9px] text-slate-500 mt-0.5 leading-relaxed">
                Case records and associated materials are subject to
                institutional authorization and case-level access controls.
              </div>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 text-[8px] font-mono font-bold text-emerald-700 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            ACCESS CONTROL ACTIVE
          </div>
        </div>
      </section>
    </div>
  );
};

/**
 * Small local icon wrapper used for the statute metadata row.
 */
const ScaleIcon = () => (
  <span
    className="inline-flex items-center justify-center w-3.5 h-3.5 text-slate-400"
    aria-hidden="true"
  >
    ⚖
  </span>
);