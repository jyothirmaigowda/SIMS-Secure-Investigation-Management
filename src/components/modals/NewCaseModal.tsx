import React, { useState } from 'react';
import { FolderLock, X, MapPin, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { User } from '../../types.ts';

interface NewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (caseId: string) => void;
  currentUser: User;
}

const RAMANAGARA_JURISDICTIONS = [
  'RAMANAGARA',
  'CHANNAPATNA',
  'KANAKAPURA',
  'MAGADI',
  'HAROHALLI',
];

const NewCaseModal: React.FC<NewCaseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
}) => {
  const initialJurisdiction = RAMANAGARA_JURISDICTIONS.includes(
    currentUser.jurisdiction?.toUpperCase?.() || ''
  )
    ? currentUser.jurisdiction.toUpperCase()
    : 'RAMANAGARA';

  const [caseNumber, setCaseNumber] = useState(
    `FIR-${String(Math.floor(1 + Math.random() * 999)).padStart(3, '0')}/2026`
  );
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState('HIGH');
  const [sensitivity, setSensitivity] = useState('CONFIDENTIAL');
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction);
  const [incidentDate, setIncidentDate] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [location, setLocation] = useState('');
  const [statuteViolation, setStatuteViolation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.createCase({
        case_number: caseNumber.trim(),
        title: title.trim(),
        summary: summary.trim(),
        priority,
        sensitivity,
        jurisdiction,
        incident_date: new Date(incidentDate).toISOString(),
        location: location.trim(),
        statute_violation: statuteViolation.trim(),
      });

      onSuccess(res.caseId);
      onClose();

      // Reset form for the next case.
      setCaseNumber(
        `FIR-${String(Math.floor(1 + Math.random() * 999)).padStart(3, '0')}/2026`
      );
      setTitle('');
      setSummary('');
      setPriority('HIGH');
      setSensitivity('CONFIDENTIAL');
      setJurisdiction(initialJurisdiction);
      setIncidentDate(new Date().toISOString().slice(0, 16));
      setLocation('');
      setStatuteViolation('');
    } catch (err: any) {
      setError(
        err?.data?.message ||
          err?.message ||
          'Unable to create the investigation case.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <FolderLock className="w-5 h-5 text-blue-600" />

              <h2 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wide">
                Initiate Investigation Case
              </h2>
            </div>

            <p className="mt-1 ml-7 text-[10px] text-slate-500 font-mono">
              SIMS • Ramanagara Jurisdiction • Karnataka
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security banner */}
        <div className="mx-6 mt-5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />

          <div>
            <p className="text-[11px] font-semibold text-blue-900">
              Controlled Investigation Record
            </p>

            <p className="text-[10px] text-blue-700 mt-0.5 leading-relaxed">
              Access, assignment, jurisdiction, sensitivity and permitted
              actions are enforced by the server.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Case identification */}
          <section className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              Case Identification
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-700 font-medium block mb-1.5 text-xs">
                  Case / FIR Reference
                </label>

                <input
                  type="text"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  required
                  placeholder="FIR-047/2026"
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-blue-700 font-bold font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />

                <p className="mt-1 text-[9px] text-slate-400">
                  Fictional reference for the SIMS evaluation environment.
                </p>
              </div>

              <div>
                <label className="text-slate-700 font-medium block mb-1.5 text-xs">
                  Jurisdiction
                </label>

                <select
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                >
                  {RAMANAGARA_JURISDICTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Incident details */}
          <section className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              Incident Details
            </div>

            <div>
              <label className="text-slate-700 font-medium block mb-1.5 text-xs">
                Case Title
              </label>

              <input
                type="text"
                placeholder="e.g. UPI Investment Fraud Investigation"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="text-slate-700 font-medium block mb-1.5 text-xs">
                Preliminary Investigation Summary
              </label>

              <textarea
                placeholder="Record the initial facts, reported incident, investigative objective and known circumstances..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
                rows={4}
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white leading-relaxed resize-none"
              />
            </div>
          </section>

          {/* Classification */}
          <section className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              Security Classification
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-700 font-medium block mb-1.5 text-xs">
                  Sensitivity
                </label>

                <select
                  value={sensitivity}
                  onChange={(e) => setSensitivity(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                >
                  <option value="STANDARD">STANDARD</option>
                  <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                  <option value="SECRET">SECRET</option>
                  <option value="RESTRICTED">RESTRICTED</option>
                </select>
              </div>

              <div>
                <label className="text-slate-700 font-medium block mb-1.5 text-xs">
                  Investigation Priority
                </label>

                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>
          </section>

          {/* Location and time */}
          <section className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              Incident Location & Time
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-700 font-medium block mb-1.5 text-xs">
                  Incident Date & Time
                </label>

                <input
                  type="datetime-local"
                  value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-slate-700 font-medium mb-1.5 text-xs flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-500" />
                  Primary Incident Location
                </label>

                <input
                  type="text"
                  placeholder="e.g. Ramanagara Town, Karnataka"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
            </div>
          </section>

          {/* Legal classification */}
          <section className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              Applicable Legal Provisions
            </div>

            <div>
              <label className="text-slate-700 font-medium block mb-1.5 text-xs">
                BNS / BNSS / Other Applicable Provision(s)
              </label>

              <input
                type="text"
                placeholder="e.g. BNS provisions relating to cheating, criminal breach of trust or forgery"
                value={statuteViolation}
                onChange={(e) => setStatuteViolation(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />

              <p className="mt-1.5 text-[9px] text-slate-400 leading-relaxed">
                Enter the provisions relevant to the fictional demonstration
                case. This field does not constitute legal advice or a legal
                determination.
              </p>
            </div>
          </section>

          {/* Demo disclaimer */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-[10px] text-amber-800 leading-relaxed">
              <span className="font-bold">Demo environment:</span> Case
              references, persons, incidents and investigation records created
              through this interface are fictional evaluation data unless
              explicitly connected to an authorized real dataset.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-medium transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                submitting ||
                !caseNumber.trim() ||
                !title.trim() ||
                !summary.trim() ||
                !location.trim()
              }
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-sm transition-colors"
            >
              {submitting ? 'Creating Secure Record...' : 'Initiate Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Named export — App.tsx uses this.
export { NewCaseModal };

// Default export — also keeps the component compatible with default imports.
export default NewCaseModal;