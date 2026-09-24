import React, { useState, useEffect } from 'react';
import {
  Clock,
  Plus,
  Search,
  ExternalLink,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { TimelineEvent } from '../../types.ts';
import { formatDateTime } from '../../lib/utils.ts';

interface TimelineViewProps {
  onOpenCase: (caseId: string) => void;
  onOpenNewTimeline: () => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ onOpenCase, onOpenNewTimeline }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadTimeline();
  }, []);

  const loadTimeline = () => {
    setLoading(true);
    api.getTimeline()
      .then((res) => {
        setEvents(res.events);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Timeline error:', err);
        setLoading(false);
      });
  };

  const filtered = events.filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.source_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-serif tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Cross-Case Forensic Timeline
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Chronological sequence of incident activities, CAD dispatch logs, and forensic extractions.
          </p>
        </div>

        <button
          onClick={onOpenNewTimeline}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Record Forensic Event</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search forensic event, source, or statement..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono transition-all"
          />
        </div>
      </div>

      {/* Timeline Stream */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-xs text-xs text-slate-500">
          No events recorded.
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 pl-6 py-2">
          {filtered.map((ev) => (
            <div key={ev.id} className="relative space-y-1.5">
              <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow-xs" />
              <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
                <span className="text-blue-700 font-bold">{formatDateTime(ev.event_timestamp)}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-700 font-semibold">{ev.source_type}</span>
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                  {ev.corroboration_level}
                </span>
                {ev.case_number && (
                  <button
                    onClick={() => onOpenCase(ev.case_id)}
                    className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 ml-2 cursor-pointer"
                  >
                    <span>{ev.case_number}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              <h3 className="text-sm font-bold text-slate-900">{ev.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">{ev.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
