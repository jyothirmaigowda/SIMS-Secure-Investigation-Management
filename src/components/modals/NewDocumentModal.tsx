import React, { useEffect, useRef, useState } from 'react';
import {
  FileSignature,
  X,
  Upload,
  FileText,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { CaseItem, User } from '../../types.ts';

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedCaseId?: string;
  currentUser?: User | null;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

const DOCUMENT_TYPES = [
  {
    value: 'FIR',
    label: 'FIR / Complaint Record',
  },
  {
    value: 'WITNESS_STATEMENT',
    label: 'Witness Statement',
  },
  {
    value: 'SEIZURE_MAHAZAR',
    label: 'Seizure Mahazar / Panchanama',
  },
  {
    value: 'FORENSIC_REPORT',
    label: 'Forensic Examination Report',
  },
  {
    value: 'INVESTIGATION_DIARY',
    label: 'Investigation Diary Record',
  },
  {
    value: 'CHARGE_SHEET',
    label: 'Draft Charge Sheet / Final Report',
  },
  {
    value: 'BSA_CERTIFICATE',
    label: 'BSA Section 63 Certificate',
  },
  {
    value: 'COURT_FILING',
    label: 'Court Filing / Filing Draft',
  },
  {
    value: 'NOTICE',
    label: 'Notice / Communication',
  },
  {
    value: 'JUDGMENT_ORDER',
    label: 'Judgment / Order Record',
  },
  {
    value: 'OTHER',
    label: 'Other Case Document',
  },
];

const SENSITIVITY_OPTIONS = [
  {
    value: 'STANDARD',
    label: 'Standard',
  },
  {
    value: 'CONFIDENTIAL',
    label: 'Confidential',
  },
  {
    value: 'SECRET',
    label: 'Secret',
  },
  {
    value: 'RESTRICTED',
    label: 'Restricted',
  },
];

export const NewDocumentModal: React.FC<NewDocumentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedCaseId,
  currentUser,
}) => {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [caseId, setCaseId] = useState(preselectedCaseId || '');

  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('FIR');
  const [sensitivity, setSensitivity] = useState('CONFIDENTIAL');
  const [contentText, setContentText] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

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
      return 'Only PDF, JPG, JPEG, and PNG documents are allowed.';
    }

    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      return 'The selected file type is not permitted.';
    }

    if (selectedFile.size <= 0) {
      return 'The selected file is empty.';
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      return 'Document files must be 25 MB or smaller.';
    }

    return null;
  };

  const selectFile = (selectedFile: File | null) => {
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

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    selectFile(event.target.files?.[0] || null);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    if (event.dataTransfer.files?.length > 0) {
      selectFile(event.dataTransfer.files[0]);
    }
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
        'Document registration is restricted to the Investigating Officer role.',
      );
      return;
    }

    if (!caseId) {
      setError('Please select a case workspace.');
      return;
    }

    if (!title.trim()) {
      setError('Document title is required.');
      return;
    }

    if (title.trim().length > 200) {
      setError('Document title must be 200 characters or fewer.');
      return;
    }

    if (!contentText.trim()) {
      setError(
        'Please provide a short description or document context.',
      );
      return;
    }

    if (contentText.trim().length > 5000) {
      setError(
        'Document context must be 5,000 characters or fewer.',
      );
      return;
    }

    if (!file) {
      setError(
        'Please attach the actual document file before submitting it.',
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
      const payload = new FormData();

      payload.append('case_id', caseId);
      payload.append('title', title.trim());
      payload.append('doc_type', docType);
      payload.append('sensitivity', sensitivity);
      payload.append('content_text', contentText.trim());
      payload.append('file', file);

      await api.createDocument(payload);

      setSuccess(true);

      setTimeout(() => {
        onSuccess();
        onClose();

        setTitle('');
        setDocType('FIR');
        setSensitivity('CONFIDENTIAL');
        setContentText('');
        setFile(null);
        setCaseId(preselectedCaseId || '');
        resetFileInput();
        setSuccess(false);
      }, 800);
    } catch (err: any) {
      console.error('Document creation failed:', err);

      setError(
        err?.data?.message ||
          err?.message ||
          'Failed to store the case document.',
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
              <FileSignature size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Register Case Document
              </h2>

              <p className="text-xs text-slate-500">
                Secure Investigation Management System
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close document registration"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
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
                  Document registration is restricted
                </p>

                <p className="mt-1 text-xs leading-5">
                  Your current role can access authorized case
                  documents, but cannot create new case documents.
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

              Document successfully registered in the case record.
            </div>
          )}

          <div className="space-y-6">
            {/* Case */}
            <section>
              <SectionTitle
                icon={<FileText size={17} />}
                title="Case Workspace"
              />

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Target Case <span className="text-red-500">*</span>
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

            {/* Document information */}
            <section>
              <SectionTitle
                icon={<FileSignature size={17} />}
                title="Document Information"
              />

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Document Title{' '}
                      <span className="text-red-500">*</span>
                    </span>

                    <input
                      type="text"
                      value={title}
                      onChange={(event) =>
                        setTitle(event.target.value)
                      }
                      placeholder="Example: FIR-047/2026 — Complaint Record"
                      disabled={submitting || !isIO}
                      maxLength={200}
                      className={inputClass}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Document Type{' '}
                    <span className="text-red-500">*</span>
                  </span>

                  <select
                    value={docType}
                    onChange={(event) =>
                      setDocType(event.target.value)
                    }
                    disabled={submitting || !isIO}
                    className={inputClass}
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option
                        key={type.value}
                        value={type.value}
                      >
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Sensitivity{' '}
                    <span className="text-red-500">*</span>
                  </span>

                  <select
                    value={sensitivity}
                    onChange={(event) =>
                      setSensitivity(event.target.value)
                    }
                    disabled={submitting || !isIO}
                    className={inputClass}
                  >
                    {SENSITIVITY_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="md:col-span-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Document Context{' '}
                      <span className="text-red-500">*</span>
                    </span>

                    <textarea
                      value={contentText}
                      onChange={(event) =>
                        setContentText(event.target.value)
                      }
                      placeholder="Describe what this document contains, why it belongs to the case, and any relevant record context."
                      disabled={submitting || !isIO}
                      rows={5}
                      maxLength={5000}
                      className={`${inputClass} resize-none`}
                    />
                  </label>

                  <div className="mt-1 text-right text-[10px] text-slate-400">
                    {contentText.length}/5000
                  </div>
                </div>
              </div>
            </section>

            {/* Attachment */}
            <section>
              <SectionTitle
                icon={<Upload size={17} />}
                title="Document Attachment"
              />

              <div
                onDragEnter={(event) => {
                  event.preventDefault();

                  if (isIO) {
                    setDragActive(true);
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();

                  if (isIO) {
                    setDragActive(true);
                  }
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={handleDrop}
                onClick={() =>
                  isIO &&
                  !submitting &&
                  fileInputRef.current?.click()
                }
                className={`${
                  isIO ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                } rounded-2xl border-2 border-dashed p-7 text-center transition ${
                  dragActive
                    ? 'border-blue-500 bg-blue-50'
                    : file
                      ? 'border-emerald-300 bg-emerald-50/50'
                      : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={handleFileChange}
                  disabled={submitting || !isIO}
                  className="hidden"
                />

                {!file ? (
                  <>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                      <Upload size={23} />
                    </div>

                    <p className="text-sm font-semibold text-slate-800">
                      {isIO
                        ? 'Drop the document here'
                        : 'Document registration unavailable'}
                    </p>

                    {isIO && (
                      <>
                        <p className="mt-1 text-xs text-slate-500">
                          or click to select a file
                        </p>

                        <div className="mt-4 flex justify-center gap-2">
                          <FileBadge label="PDF" />
                          <FileBadge label="JPG" />
                          <FileBadge label="PNG" />
                        </div>

                        <p className="mt-3 text-[11px] text-slate-400">
                          Maximum file size: 25 MB
                        </p>
                      </>
                    )}
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
                    Secure document storage
                  </p>

                  <p className="mt-0.5 text-[11px] leading-5 text-blue-800">
                    The uploaded file is transferred to the
                    protected server-side document vault. The
                    server records the document version and
                    integrity information for the stored record.
                  </p>
                </div>
              </div>
            </section>

            {/* BSA notice */}
            {docType === 'BSA_CERTIFICATE' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-900">
                  Electronic record certificate
                </p>

                <p className="mt-1 text-[11px] leading-5 text-amber-800">
                  Certificate records are maintained as part of
                  the electronic record workflow. This interface
                  does not itself certify legal admissibility or
                  constitute government certification.
                </p>
              </div>
            )}
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
                  Signing &amp; Storing...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 size={17} />
                  Stored
                </>
              ) : (
                <>
                  <ShieldCheck size={17} />
                  Store Document
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

function FileBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">
      {label}
    </span>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50';