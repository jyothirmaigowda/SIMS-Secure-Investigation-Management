import React, { useEffect, useState } from 'react';
import {
  Clock,
  X,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { CaseItem } from '../../types.ts';

interface NewTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedCaseId?: string;
}

const SOURCE_TYPES = [
  {
    value: 'FIR_RECORD',
    label: 'FIR / Complaint Record',
  },
  {
    value: 'WITNESS_STATEMENT',
    label: 'Witness Statement',
  },
  {
    value: 'EVIDENCE_INTAKE',
    label: 'Evidence Intake',
  },
  {
    value: 'DOCUMENT_RECORD',
    label: 'Case Document',
  },
  {
    value: 'FORENSIC_REPORT',
    label: 'Forensic Report',
  },
  {
    value: 'INVESTIGATION_DIARY',
    label: 'Investigation Diary',
  },
  {
    value: 'CUSTODY_TRANSFER',
    label: 'Custody Transfer',
  },
  {
    value: 'COURT_EVENT',
    label: 'Court / Legal Event',
  },
  {
    value: 'OFFICER_ACTION',
    label: 'Investigating Officer Action',
  },
  {
    value: 'OTHER',
    label: 'Other Recorded Event',
  },
];

const CORROBORATION_LEVELS = [
  {
    value: 'UNVERIFIED',
    label: 'Unverified',
    description: 'Event recorded but not yet corroborated.',
  },
  {
    value: 'CORROBORATED',
    label: 'Corroborated',
    description: 'Supported by another record, witness, or evidence.',
  },
  {
    value: 'DEFINITIVE_RECORD',
    label: 'Definitive Record',
    description: 'Supported by an authoritative case record.',
  },
];

export const NewTimelineModal: React.FC<NewTimelineModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedCaseId,
}) => {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [caseId, setCaseId] = useState(preselectedCaseId || '');

  const [timestamp, setTimestamp] = useState(
    new Date().toISOString().slice(0, 16)
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [sourceType, setSourceType] =
    useState('OFFICER_ACTION');

  const [corroborationLevel, setCorroborationLevel] =
    useState<
      'UNVERIFIED' | 'CORROBORATED' | 'DEFINITIVE_RECORD'
    >('CORROBORATED');

  const [location, setLocation] = useState('');

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

    if (!title.trim()) {
      setError('Event title is required.');
      return;
    }

    if (!description.trim()) {
      setError('Event description is required.');
      return;
    }

    if (!timestamp) {
      setError('Event date and time are required.');
      return;
    }

    setSubmitting(true);

    try {
      /*
       * Preserve the existing backend timeline API contract.
       * Location is included in the description when supplied so
       * we do not invent a new backend field.
       */
      const finalDescription = location.trim()
        ? `${description.trim()}\n\nRecorded location: ${location.trim()}`
        : description.trim();

      await api.addTimelineEvent({
        case_id: caseId,
        event_timestamp: new Date(timestamp).toISOString(),
        title: title.trim(),
        description: finalDescription,
        source_type: sourceType,
        corroboration_level: corroborationLevel,
      });

      setSuccess(true);

      setTimeout(() => {
        onSuccess();
        onClose();

        setTitle('');
        setDescription('');
        setSourceType('OFFICER_ACTION');
        setCorroborationLevel('CORROBORATED');
        setLocation('');
        setTimestamp(
          new Date().toISOString().slice(0, 16)
        );
        setSuccess(false);
      }, 700);
    } catch (err: any) {
      console.error('Failed to record timeline event:', err);

      setError(
        err?.data?.message ||
          err?.message ||
          'Failed to record the investigation timeline event.'
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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Clock size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Record Investigation Timeline Event
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

              Timeline event recorded successfully.
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

            {/* Event details */}
            <section>
              <SectionTitle
                icon={<Clock size={17} />}
                title="Event Details"
              />

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Event Date & Time{' '}
                    <span className="text-red-500">*</span>
                  </span>

                  <input
                    type="datetime-local"
                    value={timestamp}
                    onChange={(event) =>
                      setTimestamp(event.target.value)
                    }
                    disabled={submitting}
                    className={inputClass}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Source Type{' '}
                    <span className="text-red-500">*</span>
                  </span>

                  <select
                    value={sourceType}
                    onChange={(event) =>
                      setSourceType(event.target.value)
                    }
                    disabled={submitting}
                    className={inputClass}
                  >
                    {SOURCE_TYPES.map((source) => (
                      <option
                        key={source.value}
                        value={source.value}
                      >
                        {source.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="md:col-span-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Event Title{' '}
                      <span className="text-red-500">*</span>
                    </span>

                    <input
                      type="text"
                      value={title}
                      onChange={(event) =>
                        setTitle(event.target.value)
                      }
                      placeholder="Example: Mobile device seized from suspect during search"
                      disabled={submitting}
                      className={inputClass}
                    />
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Event Description{' '}
                      <span className="text-red-500">*</span>
                    </span>

                    <textarea
                      value={description}
                      onChange={(event) =>
                        setDescription(event.target.value)
                      }
                      placeholder="Record the factual event, action taken, source of the information, and its relevance to the investigation."
                      rows={5}
                      disabled={submitting}
                      className={`${inputClass} resize-none`}
                    />
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
                      <MapPin size={15} />
                      Recorded Location
                    </span>

                    <input
                      type="text"
                      value={location}
                      onChange={(event) =>
                        setLocation(event.target.value)
                      }
                      placeholder="Example: Ramanagara Town PS / Channapatna / Kanakapura"
                      disabled={submitting}
                      className={inputClass}
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* Corroboration */}
            <section>
              <SectionTitle
                icon={<CheckCircle2 size={17} />}
                title="Corroboration"
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {CORROBORATION_LEVELS.map((level) => {
                  const selected =
                    corroborationLevel === level.value;

                  return (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() =>
                        setCorroborationLevel(
                          level.value as
                            | 'UNVERIFIED'
                            | 'CORROBORATED'
                            | 'DEFINITIVE_RECORD'
                        )
                      }
                      disabled={submitting}
                      className={`rounded-xl border p-4 text-left transition ${
                        selected
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <p
                        className={`text-sm font-semibold ${
                          selected
                            ? 'text-blue-800'
                            : 'text-slate-800'
                        }`}
                      >
                        {level.label}
                      </p>

                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        {level.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Demo notice */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold text-amber-900">
                Investigation record notice
              </p>

              <p className="mt-1 text-[11px] leading-5 text-amber-800">
                Timeline entries should record factual investigation
                events and their source. This demonstration uses
                fictional Ramanagara case records and is not an
                official investigation diary or government record.
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
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                  Recording...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 size={17} />
                  Recorded
                </>
              ) : (
                <>
                  <Clock size={17} />
                  Record Event
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
      <span className="text-blue-700">{icon}</span>

      <h3 className="font-semibold text-slate-900">
        {title}
      </h3>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50';