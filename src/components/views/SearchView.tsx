import React, { useState, useEffect } from 'react';
import {
  Search as SearchIcon,
  FolderLock,
  Archive,
  FileText,
  FileCheck2,
  ArrowRight
} from 'lucide-react';
import { api } from '../../lib/api';
import { truncateHash } from '../../lib/utils';

interface SearchViewProps {
  initialQuery?: string;
  onOpenCase: (caseId: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ initialQuery = '', onOpenCase }) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<{ cases: any[]; evidence: any[]; documents: any[]; reports: any[] }>({
    cases: [],
    evidence: [],
    documents: [],
    reports: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await api.search(q);
      setResults(res || { cases: [], evidence: [], documents: [], reports: [] });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const totalResults = results.cases.length + results.evidence.length + results.documents.length + (results.reports?.length || 0);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-bold text-slate-900 font-serif tracking-tight flex items-center gap-2">
          <SearchIcon className="w-5 h-5 text-blue-600" />
          Universal Investigative Search
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Query across open and closed cases, seized evidence, custody tracking IDs, and legal documents.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search keywords, tracking numbers, SHA-256 digests, statute codes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {query && !loading && (
        <p className="text-xs font-mono text-slate-500">
          Found {totalResults} result{totalResults === 1 ? '' : 's'} for "{query}"
        </p>
      )}

      {/* Results Sections */}
      <div className="space-y-6">
        {/* Cases */}
        {results.cases.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 font-mono">
              <FolderLock className="w-4 h-4 text-blue-600" />
              Cases ({results.cases.length})
            </h2>
            <div className="space-y-2">
              {results.cases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onOpenCase(c.id)}
                  className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-xs cursor-pointer flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-blue-700">{c.case_number}</span>
                      <span className="text-slate-500 font-mono text-[11px]">{c.jurisdiction}</span>
                    </div>
                    <p className="font-semibold text-slate-900">{c.title}</p>
                    <p className="text-[11px] text-slate-600 line-clamp-1">{c.summary}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evidence */}
        {results.evidence.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 font-mono">
              <Archive className="w-4 h-4 text-blue-600" />
              Evidence Items ({results.evidence.length})
            </h2>
            <div className="space-y-2">
              {results.evidence.map((e) => (
                <div
                  key={e.id}
                  onClick={() => onOpenCase(e.case_id)}
                  className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-xs cursor-pointer flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-blue-700">{e.tracking_number}</span>
                      <span className="text-slate-500 font-mono text-[11px]">[{e.category}]</span>
                      <span className="text-[10px] text-emerald-700 font-mono font-medium">
                        SHA-256: {truncateHash(e.sha256_hash, 8)}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900">{e.title}</p>
                    <p className="text-[11px] text-slate-600 line-clamp-1">{e.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        {results.documents.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 font-mono">
              <FileText className="w-4 h-4 text-blue-600" />
              Documents & Warrants ({results.documents.length})
            </h2>
            <div className="space-y-2">
              {results.documents.map((d) => (
                <div
                  key={d.id}
                  onClick={() => onOpenCase(d.case_id)}
                  className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-xs cursor-pointer flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-blue-700">{d.document_number}</span>
                      <span className="text-slate-500 font-mono text-[11px]">[{d.doc_type}]</span>
                    </div>
                    <p className="font-semibold text-slate-900">{d.title}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Reports */}
        {(results.reports?.length || 0) > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 font-mono">
              <FileCheck2 className="w-4 h-4 text-blue-600" />
              Reports ({results.reports.length})
            </h2>
            <div className="space-y-2">
              {results.reports.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onOpenCase(r.case_id)}
                  className="p-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-xs cursor-pointer flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-blue-700">{r.report_type} REPORT</span>
                      <span className="text-slate-500 font-mono text-[11px]">[Status: {r.status}]</span>
                    </div>
                    <p className="font-semibold text-slate-900">{r.title}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
