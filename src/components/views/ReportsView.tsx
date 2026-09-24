import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Scale,
  FileCheck2,
  ExternalLink,
  Download
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { CaseReview, User } from '../../types.ts';
import { formatDateTime } from '../../lib/utils.ts';

interface ReportsViewProps {
  currentUser: User;
  onOpenCase: (caseId: string) => void;
  onOpenNewReview: (caseId?: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  currentUser,
  onOpenCase,
  onOpenNewReview,
}) => {
  const [reviews, setReviews] = useState<CaseReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = () => {
    setLoading(true);
    api.getReviews()
      .then((res) => {
        setReviews(res.reviews);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Reviews load error:', err);
        setLoading(false);
      });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-serif tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Supervisory Sign-Offs & Indictment Evaluations
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Prosecutorial reviews, statutory sufficiency audits, and probable cause assessments.
          </p>
        </div>

        {(currentUser.role === 'SUPERVISOR' || currentUser.role === 'LEGAL' || currentUser.role === 'ADMIN') && (
          <button
            onClick={() => onOpenNewReview()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Submit Formal Evaluation</span>
          </button>
        )}
      </div>

      {/* Review List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-xs text-xs text-slate-500">
          No supervisory or legal evaluations recorded.
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-mono font-bold text-slate-800">{r.review_type}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                      r.decision === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {r.decision}
                    </span>
                    {r.case_number && (
                      <button
                        onClick={() => onOpenCase(r.case_id)}
                        className="text-[10px] font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>{r.case_number}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Reviewer: {r.reviewer_name} ({r.reviewer_role}, Badge #{r.reviewer_badge})
                  </h3>
                </div>

                <span className="text-xs font-mono text-slate-500">{formatDateTime(r.created_at)}</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed">
                {r.comments}
              </div>

              {r.statutory_notes && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-mono">
                  Deficiency / Action Items: {r.statutory_notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
