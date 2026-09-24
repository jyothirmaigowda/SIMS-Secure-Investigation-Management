import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  Lock,
  FileSignature,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { CaseDocument, User } from '../../types.ts';
import { formatDateTime, truncateHash } from '../../lib/utils.ts';

interface DocumentsViewProps {
  currentUser: User;
  onOpenCase: (caseId: string) => void;
  onOpenNewDocument: () => void;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  currentUser,
  onOpenCase,
  onOpenNewDocument,
}) => {
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = () => {
    setLoading(true);
    api.getDocuments()
      .then((res) => {
        setDocuments(res.documents);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Documents load error:', err);
        setLoading(false);
      });
  };

  const handleSignDocument = async (docId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await api.signDocument(docId, decision);
      loadDocuments();
      alert(`Document endorsement completed: ${decision}`);
    } catch (err: any) {
      alert('Authorization Denied: ' + (err.data?.message || err.message));
    }
  };

  const filtered = documents.filter((d) => {
    const matchesSearch =
      d.document_number.toLowerCase().includes(search.toLowerCase()) ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.content_text.toLowerCase().includes(search.toLowerCase()) ||
      (d.author_name && d.author_name.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === 'ALL' || d.doc_type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-serif tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Documents, Warrants & Legal Affidavits
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cryptographically signed legal instruments, search warrants, and witness deposition records.
          </p>
        </div>

        <button
          onClick={onOpenNewDocument}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Draft New Document</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search document #, title, content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono transition-all"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
          <span>Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          >
            <option value="ALL">All Types</option>
            <option value="SEARCH_WARRANT">Search Warrant</option>
            <option value="AFFIDAVIT">Probable Cause Affidavit</option>
            <option value="INTERROGATION_TRANSCRIPT">Interrogation Transcript</option>
            <option value="FORENSIC_REPORT">Forensic Report</option>
            <option value="LEGAL_INDICTMENT_MEMO">Indictment Memo</option>
          </select>
        </div>
      </div>

      {/* Document Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-xs text-xs text-slate-500">
          No documents match criteria.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {doc.document_number}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {doc.doc_type}
                    </span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                      doc.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : doc.status === 'REJECTED'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {doc.status}
                    </span>
                    {doc.case_number && (
                      <button
                        onClick={() => onOpenCase(doc.case_id)}
                        className="text-[10px] font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>{doc.case_number}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{doc.title}</h3>
                </div>

                {/* Legal / Supervisory Sign Actions */}
                {(currentUser.role === 'LEGAL' || currentUser.role === 'SUPERVISOR' || currentUser.role === 'ADMIN') && doc.status === 'SUBMITTED' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSignDocument(doc.id, 'APPROVED')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      Endorse & Sign
                    </button>
                    <button
                      onClick={() => handleSignDocument(doc.id, 'REJECTED')}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {doc.content_text}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] font-mono text-slate-500">
                <div>
                  Author: <strong className="text-slate-800">{doc.author_name}</strong>
                  {doc.signed_by_id && (
                    <span className="ml-2">• Signed by: <strong className="text-emerald-600">{doc.signer_name}</strong></span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-blue-600" />
                  <span>SHA-256: {truncateHash(doc.sha256_hash, 12)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
