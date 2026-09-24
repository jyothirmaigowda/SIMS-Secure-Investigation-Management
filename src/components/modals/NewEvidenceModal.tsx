import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  X,
  Upload,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { CaseItem, User } from '../../types.ts';

interface NewEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedCaseId?: string;
  currentUser?: User | null;
}

type EvidenceCategory =
  | 'DIGITAL'
  | 'PHYSICAL'
  | 'FORENSIC'
  | 'DOCUMENTARY'
  | 'BIOLOGICAL'
  | 'SURVEILLANCE';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
  'application/json',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
];

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.txt',
  '.json',
  '.mp3',
  '.wav',
  '.mp4',
];

export const NewEvidenceModal: React.FC<NewEvidenceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedCaseId,
  currentUser,
}) => {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [caseId, setCaseId] = useState(preselectedCaseId || '');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] =
    useState<EvidenceCategory>('DIGITAL');

  const [storageLocation, setStorageLocation] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isIO =
    !currentUser ||
    currentUser.role === 'IO';

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setError(null);
    setSuccess(false);

    if (preselectedCaseId) {
      setCaseId(preselectedCaseId);
    } else {
      setCaseId('');
    }

    api
      .getCases()
      .then((res) => {
        const availableCases = res.cases || [];

        setCases(availableCases);

        if (preselectedCaseId) {
          const exists = availableCases.some(
            (item) => item.id === preselectedCaseId,
          );

          if (!exists) {
            setError(
              'The selected case is not available in your authorized case workspace.',
            );
          }
        } else if (availableCases.length > 0) {
          setCaseId(availableCases[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load cases:', err);
        setCases([]);
        setError('Unable to load available case workspaces.');
      });
  }, [isOpen, preselectedCaseId]);

  if (!isOpen) {
    return null;
  }

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validateFile = (selectedFile: File): string | null => {
    const extension = `.${selectedFile.name
      .split('.')
      .pop()
      ?.toLowerCase()}`;

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return 'This evidence file type is not permitted.';
    }

    if (
      selectedFile.type &&
      !ALLOWED_FILE_TYPES.includes(selectedFile.type)
    ) {
      return 'The selected evidence file type is not permitted.';
    }

    if (selectedFile.size <= 0) {
      return 'The selected evidence file is empty.';
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      return 'Evidence files must be 100 MB or smaller.';
    }

    return null;
  };

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0] || null;

    if (!selectedFile) {
      return;
    }

    setError(null);

    const validationError = validateFile(selectedFile);

    if (validationError) {
      setFile(null);
      resetFileInput();
      setError(validationError);
      return;
    }

    setFile(selectedFile);
  };

  const removeFile = () => {
    setFile(null);
    resetFileInput();
    setError(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setError(null);

    if (!isIO) {
      setError(
        'Evidence registration is restricted to the Investigating Officer role.',
      );
      return;
    }

    if (!caseId) {
      setError('Please select an authorized case workspace.');
      return;
    }

    if (!title.trim()) {
      setError('Evidence title is required.');
      return;
    }

    if (title.trim().length > 200) {
      setError('Evidence title must be 200 characters or fewer.');
      return;
    }

    if (!description.trim()) {
      setError('Evidence description is required.');
      return;
    }

    if (description.trim().length > 5000) {
      setError(
        'Evidence description must be 5,000 characters or fewer.',
      );
      return;
    }

    if (!storageLocation.trim()) {
      setError('Vault or storage location is required.');
      return;
    }

    if (!conditionNotes.trim()) {
      setError('Packaging and condition notes are required.');
      return;
    }

    /*
     * Evidence registration must represent an actual artifact.
     * We intentionally do not fabricate a file, size, MIME type,
     * or hash when no attachment is supplied.
     */
    if (!file) {
      setError(
        'Attach the evidence artifact before registering it.',
      );
      return;
    }

    const validationError = validateFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();

      formData.append('case_id', caseId);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('category', category);
      formData.append(
        'storage_location',
        storageLocation.trim(),
      );
      formData.append(
        'condition_notes',
        conditionNotes.trim(),
      );
      formData.append(
        'collected_at',
        new Date().toISOString(),
      );
      formData.append('file', file);

      await api.registerEvidence(formData);

      setSuccess(true);

      setTimeout(() => {
        onSuccess();
        onClose();

        setTitle('');
        setDescription('');
        setCategory('DIGITAL');
        setStorageLocation('');
        setConditionNotes('');
        setFile(null);
        setCaseId(preselectedCaseId || '');
        resetFileInput();
        setSuccess(false);
      }, 800);
    } catch (err: any) {
      console.error('Evidence registration failed:', err);

      setError(
        err?.data?.message ||
          err?.message ||
          'Failed to register the evidence artifact.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Archive size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Register Evidence
              </h2>

              <p className="text-xs text-slate-500">
                Evidence registry and secure artifact ingestion
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close evidence registration"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          {!isIO && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <ShieldCheck
                size={18}
                className="mt-0.5 shrink-0"
              />

              <div>
                <p className="font-semibold">
                  Evidence registration is restricted
                </p>

                <p className="mt-1 text-xs leading-5">
                  Your current role can review authorized evidence,
                  but cannot register new evidence artifacts.
                </p>
              </div>
            </div>
          )}

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

              Evidence artifact successfully registered.
            </div>
          )}

          <div className="space-y-6">
            {/* Case */}
            <section>
              <SectionTitle
                icon={<Archive size={17} />}
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
                  disabled={submitting || !isIO}
                  className={inputClass}
                >
                  <option value="">
                    Select an authorized case...
                  </option>

                  {cases.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.case_number} — {item.title}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {/* Evidence identity */}
            <section>
              <SectionTitle
                icon={<FileText size={17} />}
                title="Evidence Identity"
              />

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Evidence Title / Item Name{' '}
                    <span className="text-red-500">*</span>
                  </span>

                  <input
                    type="text"
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value)
                    }
                    placeholder="Example: Seized mobile device"
                    maxLength={200}
                    disabled={submitting || !isIO}
                    className={inputClass}
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Evidence Category{' '}
                      <span className="text-red-500">*</span>
                    </span>

                    <select
                      value={category}
                      onChange={(event) =>
                        setCategory(
                          event.target
                            .value as EvidenceCategory,
                        )
                      }
                      disabled={submitting || !isIO}
                      className={inputClass}
                    >
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
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Vault / Locker Location{' '}
                      <span className="text-red-500">*</span>
                    </span>

                    <input
                      type="text"
                      value={storageLocation}
                      onChange={(event) =>
                        setStorageLocation(
                          event.target.value,
                        )
                      }
                      placeholder="Example: Evidence Locker A / Bin 14"
                      maxLength={250}
                      disabled={submitting || !isIO}
                      className={inputClass}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Item Description &amp; Seizure Context{' '}
                    <span className="text-red-500">*</span>
                  </span>

                  <textarea
                    value={description}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                    placeholder="Record the relevant physical or digital characteristics, location found, identifying marks, serial numbers, and collection context."
                    maxLength={5000}
                    rows={4}
                    disabled={submitting || !isIO}
                    className={`${inputClass} resize-none`}
                  />

                  <div className="mt-1 text-right text-[10px] text-slate-400">
                    {description.length}/5000
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Packaging &amp; Condition Notes{' '}
                    <span className="text-red-500">*</span>
                  </span>

                  <textarea
                    value={conditionNotes}
                    onChange={(event) =>
                      setConditionNotes(
                        event.target.value,
                      )
                    }
                    placeholder="Record packaging, seal condition, visible damage, and relevant handling observations."
                    maxLength={2000}
                    rows={3}
                    disabled={submitting || !isIO}
                    className={`${inputClass} resize-none`}
                  />
                </label>
              </div>
            </section>

            {/* Artifact */}
            <section>
              <SectionTitle
                icon={<Upload size={17} />}
                title="Evidence Artifact"
              />

              <div
                onClick={() =>
                  isIO &&
                  !submitting &&
                  fileInputRef.current?.click()
                }
                className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
                  isIO
                    ? 'cursor-pointer border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_EXTENSIONS.join(',')}
                  onChange={handleFileChange}
                  disabled={submitting || !isIO}
                  className="hidden"
                />

                {!file ? (
                  <>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                      <Upload size={22} />
                    </div>

                    <p className="text-sm font-semibold text-slate-800">
                      Attach the evidence artifact
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      PDF, images, text, JSON, audio or video
                    </p>

                    <p className="mt-3 text-[11px] text-slate-400">
                      Maximum file size: 100 MB
                    </p>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-4 text-left">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                        <FileText size={21} />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {file.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {file.type || 'Unknown type'} •{' '}
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFile();
                      }}
                      disabled={submitting || !isIO}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <ShieldCheck
                  size={17}
                  className="mt-0.5 shrink-0 text-blue-600"
                />

                <div>
                  <p className="text-xs font-semibold text-blue-900">
                    Integrity-controlled ingestion
                  </p>

                  <p className="mt-0.5 text-[11px] leading-5 text-blue-800">
                    The original artifact is transferred to the
                    protected server-side vault. The backend records
                    its integrity hash and evidence provenance as
                    part of the evidence record.
                  </p>
                </div>
              </div>
            </section>
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
              disabled={submitting || success || !isIO}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                  Hashing &amp; Securing...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 size={17} />
                  Registered
                </>
              ) : (
                <>
                  <ShieldCheck size={17} />
                  Register Evidence
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