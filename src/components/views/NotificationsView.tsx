import React, { useState, useEffect } from 'react';
import {
  Bell,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { NotificationItem } from '../../types.ts';
import { formatDateTime } from '../../lib/utils.ts';

interface NotificationsViewProps {
  onOpenCase: (caseId: string) => void;
  onRefreshUnreadCount?: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ onOpenCase, onRefreshUnreadCount }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = () => {
    setLoading(true);
    api.getNotifications()
      .then((res) => {
        setNotifications(res.notifications);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load notifications:', err);
        setLoading(false);
      });
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      if (onRefreshUnreadCount) onRefreshUnreadCount();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-bold text-slate-900 font-serif tracking-tight flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-600" />
          Security Alerts & Operational Notifications
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Real-time alerts for access control violations, review requests, and custody transfers.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-xs text-xs text-slate-500">
          No notifications recorded.
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const isAlert = n.severity === 'ALERT' || n.severity === 'CRITICAL';
            const isWarning = n.severity === 'WARNING';

            return (
              <div
                key={n.id}
                className={`p-4 rounded-xl border text-xs transition-colors shadow-xs ${
                  isAlert
                    ? 'bg-red-50/60 border-red-200'
                    : isWarning
                    ? 'bg-amber-50/60 border-amber-200'
                    : 'bg-white border-slate-200'
                } space-y-2`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isAlert ? (
                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                    ) : isWarning ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    ) : (
                      <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    )}
                    <h3 className="font-bold text-slate-900">{n.title}</h3>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-slate-50 text-slate-600 border-slate-200 font-medium">
                      {n.severity}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">{formatDateTime(n.created_at)}</span>
                </div>

                <p className="text-slate-600 leading-relaxed pl-6">{n.message}</p>

                <div className="flex items-center justify-between pl-6 pt-2 border-t border-slate-100 text-[11px] font-mono">
                  {n.case_id ? (
                    <button
                      onClick={() => onOpenCase(n.case_id!)}
                      className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Associated Case</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  ) : (
                    <span />
                  )}

                  {!n.is_read && (
                    <button
                      onClick={() => handleMarkAsRead(n.id)}
                      className="text-slate-500 hover:text-emerald-700 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Acknowledge / Mark Read</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
