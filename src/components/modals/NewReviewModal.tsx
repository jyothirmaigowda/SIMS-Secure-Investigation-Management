import React, { useEffect, useState } from 'react';
import {
  FileCheck2,
  X,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Scale,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { CaseItem } from '../../types.ts';

interface NewReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedCaseId?: string;
}

type ReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUIRED'
  | 'REJECTED'
  | 'FLAGGED_DEFICIENCY';

const REVIEW_TYPES = [
  {
    value: 'SUPERVISORY',
    label: 'Supervisory Review',
    description:
      'Review of investigation progress, records, evidence and procedural completeness.',
  },
  {
    value: 'LEGAL_COMPLIANCE',
    label: 'Legal Compliance Review',
    description:
      'Review of legal and procedural requirements before prosecution preparation.',
  },
  {
    value: 'INDICTMENT_REVIEW',
    label: 'Charge Sheet / Final Report Review',
    description:
      'Review of the draft prosecution record before it is marked ready.',
  },
];

const DECISIONS: Array<{
  value: ReviewDecision;
  label: string;
  description: string;
}> = [
  {
    value: 'APPROVED',
    label: 'Approved',
    description:
      'The submitted material is acceptable for the current review stage.',
  },
  {
    value: 'CHANGES_REQUIRED',
    label: 'Changes Required',
    description:
      'Corrections or additional material are required before approval.',
  },
  {
    value: 'REJECTED',
    label: 'Rejected',
    description:
      'The submission cannot proceed in its current form.',
  },
  {
    value: 'FLAGGED_DEFICIENCY',
    label: 'Deficiency Flagged',
    description:
      'A material deficiency has been identified and needs attention.',
  },
];

export const NewReviewModal: React.FC<NewReviewModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedCaseId,
}) => {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [caseId, setCaseId] = useState(preselectedCaseId || '');

  const [reviewType, setReviewType] =
    useState('SUPERVISORY');

  const [decision, setDecision] =
    useState<ReviewDecision>('APPROVED');

  const [comments, setComments] = useState('');
  const [statutoryNotes, setStatutoryNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setSuccess(false);

    if (preselectedCaseId) {
      setCaseId(preselectedCaseId);
    }

    api
      .getCases()
      .then((res) => {
        setCases(res.cases || []);

        if (
          !preselectedCaseId &&
          !caseId &&
          res.cases?.length > 0
        ) {
          setCaseId(res.cases[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load cases:', err);
        setError('Unable to load available case workspaces.');
      });
  }, [isOpen, preselectedCaseId]);

  if (!isOpen) return null;

  const handleSubmit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    setError(null);

    if (!caseId) {
      setError('Please select a case workspace.');
      return;
    }

    if (!comments.trim()) {
      setError(
        'Review comments are required so the decision is traceable.'
      );
      return;
    }

    if (
      (decision === 'CHANGES_REQUIRED' ||
        decision === 'REJECTED' ||
        decision === 'FLAGGED_DEFICIENCY') &&
      comments.trim().length < 20
    ) {
      setError(
        'Please provide enough detail to explain the required changes or deficiency.'
      );
      return;
    }

    setSubmitting(true);

    try {
      await api.submitReview({
        case_id: caseId,
        review_type: reviewType,
        decision,
        comments: comments.trim(),
        statutory_notes: statutoryNotes.trim(),
      });

      setSuccess(true);

      setTimeout(() => {
        onSuccess();
        onClose();

        setComments('');
        setStatutoryNotes('');
        setReviewType('SUPERVISORY');
        setDecision('APPROVED');
        setSuccess(false);
      }, 800);
    } catch (err: any) {
      console.error('Failed to submit review:', err);

      setError(
        err?.data?.message ||
          err?.message ||
          'Failed to record the review decision.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <FileCheck2 size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Case Review & Decision
              </h2>

              <p className="text-xs text-slate-500">
                Ramanagara Investigation Management System
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle
                size={18}
                className="mt-0.5 shrink-0"
              />

              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={18} />

              Review decision recorded successfully.
            </div>
          )}

          <div className="space-y-6">
            {/* Case */}
            <section>
              <SectionTitle
                icon={<ShieldCheck size={17} />}
                title="Case Workspace"
              />

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Target Case{' '}
                  <span className="text-red-500">*</span>
                </span>

                <select
                  value={caseId}
                  onChange={(event) =>
                    setCaseId(event.target.value)
                  }
                  disabled={submitting}
                  className={inputClass}
                >
                  <option value="">
                    Select a Ramanagara case...
                  </option>

                  {cases.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.case_number} — {item.title}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {/* Review type */}
            <section>
              <SectionTitle
                icon={<Scale size={17} />}
                title="Review Stage"
              />

              <div className="space-y-3">
                {REVIEW_TYPES.map((type) => {
                  const selected =
                    reviewType === type.value;

                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() =>
                        setReviewType(type.value)
                      }
                      disabled={submitting}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p
                          className={`text-sm font-semibold ${
                            selected
                              ? 'text-indigo-800'
                              : 'text-slate-800'
                          }`}
                        >
                          {type.label}
                        </p>

                        {selected && (
                          <CheckCircle2
                            size={17}
                            className="text-indigo-600"
                          />
                        )}
                      </div>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {type.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Decision */}
            <section>
              <SectionTitle
                icon={<CheckCircle2 size={17} />}
                title="Review Decision"
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {DECISIONS.map((item) => {
                  const selected =
                    decision === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        setDecision(item.value)
                      }
                      disabled={submitting}
                      className={`rounded-xl border p-4 text-left transition ${
                        selected
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p
                          className={`text-sm font-semibold ${
                            selected
                              ? 'text-blue-800'
                              : 'text-slate-800'
                          }`}
                        >
                          {item.label}
                        </p>

                        {selected && (
                          <CheckCircle2
                            size={17}
                            className="text-blue-600"
                          />
                        )}
                      </div>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {item.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Comments */}
            <section>
              <SectionTitle
                icon={<FileCheck2 size={17} />}
                title="Review Record"
              />

              <div className="space-y-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Reviewer Comments{' '}
                    <span className="text-red-500">*</span>
                  </span>

                  <textarea
                    value={comments}
                    onChange={(event) =>
                      setComments(event.target.value)
                    }
                    rows={5}
                    disabled={submitting}
                    placeholder={
                      decision === 'APPROVED'
                        ? 'Record the basis for approval, documents/evidence reviewed, and any observations.'
                        : 'Clearly describe the correction, deficiency, or reason for rejection.'
                    }
                    className={`${inputClass} resize-none`}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Statutory / Procedural Notes
                  </span>

                  <textarea
                    value={statutoryNotes}
                    onChange={(event) =>
                      setStatutoryNotes(
                        event.target.value
                      )
                    }
                    rows={4}
                    disabled={submitting}
                    placeholder="Record relevant BNS / BNSS / BSA provisions, procedural observations, or compliance notes where applicable."
                    className={`${inputClass} resize-none`}
                  />
                </label>
              </div>
            </section>

            {/* Decision consequence */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <ShieldCheck
                  size={17}
                  className="mt-0.5 shrink-0 text-blue-600"
                />

                <div>
                  <p className="text-xs font-semibold text-blue-900">
                    Workflow-controlled decision
                  </p>

                  <p className="mt-1 text-[11px] leading-5 text-blue-800">
                    Review decisions are recorded against the case
                    and subject to the server-side authorization
                    policy. Approval may advance the case workflow
                    depending on the selected review stage.
                  </p>
                </div>
              </div>
            </div>

            {/* Demo notice */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold text-amber-900">
                Demonstration data only
              </p>

              <p className="mt-1 text-[11px] leading-5 text-amber-800">
                This SIH demonstration uses fictional Ramanagara
                investigation records. A review decision recorded
                here is not an official police, prosecution, or
                court determination.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || success}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                  Recording Decision...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 size={17} />
                  Recorded
                </>
              ) : (
                <>
                  <FileCheck2 size={17} />
                  Record Review
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-indigo-700">{icon}</span>

      <h3 className="font-semibold text-slate-900">
        {title}
      </h3>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50';