import React, { useState, useEffect } from 'react';
import {
  History,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Search,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { AuditLog } from '../../types.ts';
import { formatDateTime, truncateHash } from '../../lib/utils.ts';

interface AuditViewProps {
  onOpenCase: (caseId: string) => void;
}

export const AuditView: React.FC<AuditViewProps> = ({ onOpenCase }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [filterAction, setFilterAction] = useState('ALL');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = () => {
    setLoading(true);
    api.getAuditLogs(undefined, 100)
      .then((res) => {
        setLogs(res.logs);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Audit fetch error:', err);
        setLoading(false);
      });
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyAuditChain();
      setVerifyResult(res);
    } catch (err: any) {
      alert('Audit failed: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const filtered = logs.filter((l) => {
    if (filterAction === 'ALL') return true;
    if (filterAction === 'ALERTS') return l.status !== 'SUCCESS';
    return l.action === filterAction;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-serif tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Append-Only Cryptographic Audit Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tamper-evident hash chain linking every system transaction with SHA-256 state digests.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-mono font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{verifying ? 'Auditing SHA-256 Ledger...' : 'Validate Ledger Integrity'}</span>
          </button>
        </div>
      </div>

      {/* Verification Flash */}
      {verifyResult && (
        <div className={`p-5 rounded-xl border text-xs shadow-xs ${
          verifyResult.verified
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-red-50 border-red-200 text-red-900'
        } space-y-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm">
              {verifyResult.verified ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span>
                Cryptographic Integrity Status: {verifyResult.verified ? 'PASSED — HASH CHAIN INTACT' : 'CHAIN COMPROMISED / ANOMALIES DETECTED'}
              </span>
            </div>
            <button onClick={() => setVerifyResult(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px] bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div>Verified Records: <strong className="text-slate-900">{verifyResult.totalRecords} blocks</strong></div>
            <div>Latest Block Digest: <strong className="text-emerald-700">{truncateHash(verifyResult.latestHash, 10)}</strong></div>
            <div>Verification Result: <strong className="text-emerald-700">{verifyResult.reason}</strong></div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
          <span>Filter Action:</span>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          >
            <option value="ALL">All Audit Events</option>
            <option value="ALERTS">Security Alerts & Denials Only</option>
            <option value="CASE_CREATED">Case Created</option>
            <option value="CASE_VIEWED">Case Viewed</option>
            <option value="EVIDENCE_SEIZED">Evidence Seized</option>
            <option value="CUSTODY_TRANSFERRED">Custody Transferred</option>
            <option value="DOCUMENT_SIGNED">Document Signed</option>
            <option value="USER_LOGIN">User Login</option>
          </select>
        </div>

        <span className="text-xs font-mono text-slate-500">Showing {filtered.length} entries</span>
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-xs text-xs text-slate-500">
          No audit entries match filter.
        </div>
      ) : (
        <div className="space-y-2 font-mono text-xs">
          {filtered.map((log) => (
            <div
              key={log.id}
              className={`p-3.5 rounded-xl border transition-colors shadow-xs ${
                log.status === 'SUCCESS'
                  ? 'bg-white border-slate-200 hover:bg-slate-50/80'
                  : 'bg-red-50/60 border-red-200 hover:bg-red-50 text-red-900'
              } space-y-2`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400">#{log.sequence_num}</span>
                  <span className="font-bold text-blue-700">{log.action}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    log.status === 'SUCCESS'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200 font-bold'
                  }`}>
                    {log.status}
                  </span>
                  <span className="text-slate-500">• Target: {log.target_type}</span>
                  {log.case_id && (
                    <button
                      onClick={() => onOpenCase(log.case_id!)}
                      className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 ml-1 cursor-pointer"
                    >
                      <span>Case Ref</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                <div className="text-slate-400">{formatDateTime(log.timestamp)}</div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
                <div>
                  Actor: <strong className="text-slate-800">{log.user_name || log.user_id || 'System'}</strong>
                  {log.user_role && <span> ({log.user_role})</span>}
                  <span className="text-slate-300"> | </span>
                  <span>IP: {log.ip_address}</span>
                </div>
              </div>

              {log.details && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-700 overflow-x-auto">
                  {JSON.stringify(log.details)}
                </div>
              )}

              {/* Hash Chain Values */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-slate-500">
                <div className="truncate max-w-sm">
                  Prev Hash: <span className="text-slate-600">{truncateHash(log.prev_hash, 10)}</span>
                </div>
                <div className="truncate max-w-sm text-right">
                  Block Hash: <span className="text-emerald-700 font-semibold">{truncateHash(log.current_hash, 10)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
