import React, { useEffect, useState } from 'react';
import {
  FolderLock,
  Archive,
  FileCheck2,
  Scale,
  ShieldAlert,
  ArrowRight,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Bell,
  FileText,
  Clock3,
  Search,
  LockKeyhole,
  ClipboardList,
  Landmark,
  UserRound,
  Fingerprint,
} from 'lucide-react';

import { api } from '../../lib/api.ts';
import { User } from '../../types.ts';
import { formatDateTime } from '../../lib/utils.ts';

interface DashboardViewProps {
  currentUser: User;
  onNavigate: (route: string) => void;
  onOpenNewCase: () => void;
  onOpenNewEvidence: () => void;
}

interface DashboardStats {
  metrics: {
    activeCases: number;
    totalCases: number;
    totalEvidence: number;
    totalDocuments: number;
    pendingSupervisorReview: number;
    pendingLegalReview: number;
    securityAlerts: number;
  };
  recentCases: any[];
  recentAlerts: any[];
}

interface NotificationItem {
  id: string;
  user_id: string;
  case_id?: string | null;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ALERT' | 'CRITICAL' | string;
  is_read: boolean;
  created_at: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  onNavigate,
  onOpenNewCase,
  onOpenNewEvidence,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, [currentUser]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const [dashboardResponse, notificationResponse] = await Promise.all([
        api.getDashboardStats(),
        api.getNotifications(),
      ]);

      setStats(dashboardResponse);

      const notificationList = Array.isArray(
        notificationResponse.notifications
      )
        ? notificationResponse.notifications
        : [];

      setNotifications(notificationList);
    } catch (err: any) {
      console.error('[DASHBOARD] Failed to load dashboard:', err);

      setError(
        err?.message ||
          'Unable to retrieve the secure investigation dashboard.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[560px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#163a5f] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-[11px] font-mono uppercase tracking-[0.12em] text-slate-500">
            Loading secure records
          </p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-[560px] flex items-center justify-center px-4">
        <div className="w-full max-w-lg bg-white border border-slate-300">
          <div className="px-5 py-4 bg-[#102a43] text-white flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-300" />

            <div>
              <div className="text-xs font-bold uppercase tracking-[0.1em]">
                Records Service Unavailable
              </div>

              <div className="text-[9px] text-slate-300 mt-1">
                Secure dashboard information could not be retrieved.
              </div>
            </div>
          </div>

          <div className="p-6">
            <p className="text-xs text-slate-600 leading-relaxed">
              {error || 'Dashboard information is temporarily unavailable.'}
            </p>

            <button
              type="button"
              onClick={loadDashboard}
              className="mt-5 px-4 py-2 bg-[#163a5f] hover:bg-[#102a43] text-white text-[10px] font-bold uppercase tracking-wide transition-colors"
            >
              Retry Request
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { metrics, recentCases, recentAlerts } = stats;

  const unreadNotifications = notifications.filter(
    (notification) => !notification.is_read
  );

  const pendingReviews =
    Number(metrics.pendingSupervisorReview || 0) +
    Number(metrics.pendingLegalReview || 0);

  const getSensitivityBadge = (sensitivity: string) => {
    switch (sensitivity) {
      case 'RESTRICTED':
        return 'bg-red-50 text-red-700 border-red-200';

      case 'SECRET':
        return 'bg-amber-50 text-amber-800 border-amber-200';

      case 'CONFIDENTIAL':
        return 'bg-blue-50 text-blue-700 border-blue-200';

      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'INDICTMENT_READY':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';

      case 'LEGAL_REVIEW':
        return 'bg-purple-50 text-purple-700 border-purple-200';

      case 'SUPERVISOR_REVIEW':
        return 'bg-amber-50 text-amber-800 border-amber-200';

      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const getNotificationStyle = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
      case 'ALERT':
        return {
          wrapper: 'border-red-200 bg-red-50',
          icon: 'text-red-600',
          badge: 'bg-red-100 text-red-700 border-red-200',
        };

      case 'WARNING':
        return {
          wrapper: 'border-amber-200 bg-amber-50',
          icon: 'text-amber-600',
          badge: 'bg-amber-100 text-amber-800 border-amber-200',
        };

      default:
        return {
          wrapper: 'border-blue-200 bg-blue-50',
          icon: 'text-blue-600',
          badge: 'bg-blue-100 text-blue-700 border-blue-200',
        };
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* ============================================================
          INSTITUTIONAL PAGE INTRO
      ============================================================ */}

      <section className="bg-white border border-slate-300">
        <div className="px-5 md:px-6 py-5 border-b border-slate-200">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Landmark className="w-4 h-4 text-[#163a5f]" />

                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#163a5f]">
                  Secure Investigation Management System
                </span>

                <span className="text-slate-300">/</span>

                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Operations Dashboard
                </span>
              </div>

              <h1 className="text-xl md:text-2xl font-bold text-[#102a43] tracking-tight">
                Investigation Control Desk
              </h1>

              <p className="text-xs text-slate-500 mt-1.5 max-w-2xl">
                Authorized overview of investigation cases, evidence,
                documents, review actions and security events.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="px-3 py-2 border border-slate-300 bg-slate-50">
                <div className="text-[8px] uppercase tracking-[0.12em] text-slate-400">
                  Officer
                </div>

                <div className="text-[10px] font-bold text-[#163a5f] mt-0.5">
                  {currentUser.full_name}
                </div>
              </div>

              <div className="px-3 py-2 border border-slate-300 bg-slate-50">
                <div className="text-[8px] uppercase tracking-[0.12em] text-slate-400">
                  Jurisdiction
                </div>

                <div className="text-[10px] font-bold font-mono text-[#163a5f] mt-0.5">
                  {currentUser.jurisdiction}
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenNewCase}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#163a5f] hover:bg-[#102a43] text-white text-[10px] font-bold uppercase tracking-wide transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Case
              </button>

              <button
                type="button"
                onClick={onOpenNewEvidence}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-[#163a5f] bg-white hover:bg-slate-50 text-[#163a5f] text-[10px] font-bold uppercase tracking-wide transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                Register Evidence
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 md:px-6 py-2.5 bg-slate-50 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Secure Session
          </span>

          <span className="text-slate-300">|</span>

          <span className="text-[9px] font-mono text-slate-500">
            ROLE: {currentUser.role}
          </span>

          <span className="text-[9px] font-mono text-slate-500">
            BADGE: {currentUser.badge_number}
          </span>

          <span className="text-[9px] font-mono text-slate-500">
            ACCESS ROLE: {currentUser.role}
          </span>

          <span className="ml-auto text-[9px] font-mono font-bold text-emerald-700">
            ACCESS CONTROLS ACTIVE
          </span>
        </div>
      </section>

      {/* ============================================================
          REGISTRY SUMMARY
      ============================================================ */}

      <section className="grid grid-cols-2 xl:grid-cols-4 border border-slate-300 bg-white">
        <button
          type="button"
          onClick={() => onNavigate('cases')}
          className="text-left p-5 border-r border-b xl:border-b-0 border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                Active Cases
              </div>

              <div className="text-3xl font-bold text-[#102a43] mt-2">
                {metrics.activeCases}
              </div>

              <div className="text-[10px] text-slate-500 mt-1">
                {metrics.totalCases} total registered cases
              </div>
            </div>

            <FolderLock className="w-5 h-5 text-[#163a5f]" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('reports')}
          className="text-left p-5 border-b xl:border-b-0 xl:border-r border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                Review Queue
              </div>

              <div className="text-3xl font-bold text-[#102a43] mt-2">
                {pendingReviews}
              </div>

              <div className="text-[10px] text-slate-500 mt-1">
                {metrics.pendingSupervisorReview} supervisor /{' '}
                {metrics.pendingLegalReview} legal
              </div>
            </div>

            <FileCheck2 className="w-5 h-5 text-amber-600" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('evidence')}
          className="text-left p-5 border-r border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                Evidence Register
              </div>

              <div className="text-3xl font-bold text-[#102a43] mt-2">
                {metrics.totalEvidence}
              </div>

              <div className="text-[10px] text-slate-500 mt-1">
                Registered evidence items
              </div>
            </div>

            <Archive className="w-5 h-5 text-[#163a5f]" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('documents')}
          className="text-left p-5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                Documents
              </div>

              <div className="text-3xl font-bold text-[#102a43] mt-2">
                {metrics.totalDocuments}
              </div>

              <div className="text-[10px] text-slate-500 mt-1">
                Stored case documents
              </div>
            </div>

            <FileText className="w-5 h-5 text-slate-600" />
          </div>
        </button>
      </section>

      {/* ============================================================
          CASE REGISTER + ATTENTION
      ============================================================ */}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* CASE REGISTER */}

        <section className="xl:col-span-8 bg-white border border-slate-300">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[#163a5f]" />

                <h2 className="text-xs font-black uppercase tracking-[0.1em] text-[#102a43]">
                  Active Investigation Register
                </h2>
              </div>

              <p className="text-[10px] text-slate-500 mt-1">
                Cases available within the officer's authorized workspace.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('cases')}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#163a5f] hover:underline shrink-0"
            >
              Full Registry
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-200">
            {recentCases.length === 0 ? (
              <div className="py-14 text-center">
                <FolderLock className="w-8 h-8 text-slate-300 mx-auto" />

                <p className="text-xs font-semibold text-slate-600 mt-3">
                  No active cases available
                </p>

                <p className="text-[10px] text-slate-400 mt-1">
                  Authorized investigation records will appear here.
                </p>
              </div>
            ) : (
              recentCases.map((caseItem: any) => (
                <button
                  type="button"
                  key={caseItem.id}
                  onClick={() => onNavigate(`cases/${caseItem.id}`)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono font-black text-[#163a5f]">
                          CASE NO. {caseItem.case_number}
                        </span>

                        {caseItem.sensitivity && (
                          <span
                            className={`px-2 py-0.5 border text-[8px] font-mono font-bold ${getSensitivityBadge(
                              caseItem.sensitivity
                            )}`}
                          >
                            {caseItem.sensitivity}
                          </span>
                        )}

                        {caseItem.status && (
                          <span
                            className={`px-2 py-0.5 border text-[8px] font-mono font-bold ${getStatusBadge(
                              caseItem.status
                            )}`}
                          >
                            {String(caseItem.status).replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 mt-2 truncate">
                        {caseItem.title}
                      </h3>

                      {caseItem.summary && (
                        <p className="text-[10px] text-slate-500 leading-relaxed mt-1.5 line-clamp-2">
                          {caseItem.summary}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[9px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="w-3 h-3" />
                          Lead IO:{' '}
                          <strong className="text-slate-700">
                            {caseItem.lead_io_name || 'Not assigned'}
                          </strong>
                        </span>

                        {caseItem.incident_date && (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="w-3 h-3" />
                            {formatDateTime(caseItem.incident_date).slice(0, 16)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-[#163a5f]">
                      Open
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* ATTENTION */}

        <section className="xl:col-span-4 bg-white border border-slate-300">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#163a5f]" />

              <h2 className="text-xs font-black uppercase tracking-[0.1em] text-[#102a43]">
                Officer Attention
              </h2>
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              Outstanding workflow and security notifications.
            </p>
          </div>

          <div className="p-4">
            {unreadNotifications.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />

                <p className="text-xs font-semibold text-slate-700 mt-3">
                  No outstanding alerts
                </p>

                <p className="text-[10px] text-slate-400 mt-1">
                  Notification queue is clear.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {unreadNotifications.slice(0, 4).map((notification) => {
                  const style = getNotificationStyle(notification.severity);

                  const critical =
                    notification.severity === 'ALERT' ||
                    notification.severity === 'CRITICAL';

                  return (
                    <button
                      type="button"
                      key={notification.id}
                      onClick={() => {
                        if (notification.case_id) {
                          onNavigate(`cases/${notification.case_id}`);
                        } else {
                          onNavigate('notifications');
                        }
                      }}
                      className={`w-full text-left border p-3 ${style.wrapper} hover:shadow-sm transition-shadow`}
                    >
                      <div className="flex items-start gap-2.5">
                        {critical ? (
                          <AlertTriangle
                            className={`w-4 h-4 mt-0.5 shrink-0 ${style.icon}`}
                          />
                        ) : (
                          <Bell
                            className={`w-4 h-4 mt-0.5 shrink-0 ${style.icon}`}
                          />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-[10px] font-bold text-slate-800">
                              {notification.title}
                            </h3>

                            <span
                              className={`shrink-0 px-1.5 py-0.5 border text-[7px] font-bold ${style.badge}`}
                            >
                              {notification.severity}
                            </span>
                          </div>

                          <p className="text-[9px] text-slate-600 leading-relaxed mt-1.5 line-clamp-3">
                            {notification.message}
                          </p>

                          <div className="text-[8px] font-mono text-slate-400 mt-2">
                            {formatDateTime(notification.created_at)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="w-full mt-3 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-[#163a5f] transition-colors"
            >
              Open Notification Centre
            </button>
          </div>
        </section>
      </div>

      {/* ============================================================
          WORKFLOW ACCESS
      ============================================================ */}

      <section className="bg-white border border-slate-300">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[#163a5f]" />

            <h2 className="text-xs font-black uppercase tracking-[0.1em] text-[#102a43]">
              Investigation Services
            </h2>
          </div>

          <p className="text-[10px] text-slate-500 mt-1">
            Authorized services available from the investigation workspace.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-200">
          <button
            type="button"
            onClick={() => onNavigate('cases')}
            className="p-5 text-left hover:bg-slate-50 transition-colors"
          >
            <FolderLock className="w-5 h-5 text-[#163a5f]" />

            <div className="text-xs font-bold text-slate-800 mt-3">
              Case Registry
            </div>

            <div className="text-[9px] text-slate-500 mt-1">
              View authorized investigation cases
            </div>

            <div className="flex items-center gap-1 mt-3 text-[8px] font-bold uppercase tracking-wide text-[#163a5f]">
              Open
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="p-5 text-left hover:bg-slate-50 transition-colors"
          >
            <FileText className="w-5 h-5 text-[#163a5f]" />

            <div className="text-xs font-bold text-slate-800 mt-3">
              Document Register
            </div>

            <div className="text-[9px] text-slate-500 mt-1">
              Access authorized case documents
            </div>

            <div className="flex items-center gap-1 mt-3 text-[8px] font-bold uppercase tracking-wide text-[#163a5f]">
              Open
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('evidence')}
            className="p-5 text-left hover:bg-slate-50 transition-colors"
          >
            <Archive className="w-5 h-5 text-amber-600" />

            <div className="text-xs font-bold text-slate-800 mt-3">
              Evidence Register
            </div>

            <div className="text-[9px] text-slate-500 mt-1">
              Register and inspect evidence records
            </div>

            <div className="flex items-center gap-1 mt-3 text-[8px] font-bold uppercase tracking-wide text-[#163a5f]">
              Open
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('search')}
            className="p-5 text-left hover:bg-slate-50 transition-colors"
          >
            <Search className="w-5 h-5 text-slate-600" />

            <div className="text-xs font-bold text-slate-800 mt-3">
              Authorized Search
            </div>

            <div className="text-[9px] text-slate-500 mt-1">
              Search records available to your account
            </div>

            <div className="flex items-center gap-1 mt-3 text-[8px] font-bold uppercase tracking-wide text-[#163a5f]">
              Open
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        </div>
      </section>

      {/* ============================================================
          SECURITY & INTEGRITY
      ============================================================ */}

      <section className="grid grid-cols-1 md:grid-cols-3 border border-slate-300 bg-white">
        <div className="p-4 border-b md:border-b-0 md:border-r border-slate-200">
          <div className="flex items-center gap-2">
            <LockKeyhole className="w-4 h-4 text-[#163a5f]" />

            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
              Access Control
            </span>
          </div>

          <div className="text-xs font-bold text-emerald-700 mt-2">
            ACTIVE
          </div>

          <div className="text-[9px] text-slate-500 mt-1">
            Role and case authorization enforced.
          </div>
        </div>

        <div className="p-4 border-b md:border-b-0 md:border-r border-slate-200">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-[#163a5f]" />

            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
              Evidence Integrity
            </span>
          </div>

          <div className="text-xs font-bold text-emerald-700 mt-2">
            SHA-256
          </div>

          <div className="text-[9px] text-slate-500 mt-1">
            Registered evidence uses cryptographic integrity verification.
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('audit')}
          className="p-4 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#163a5f]" />

            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
              Audit Trail
            </span>
          </div>

          <div className="text-xs font-bold text-emerald-700 mt-2">
            APPEND-ONLY
          </div>

          <div className="text-[9px] text-slate-500 mt-1">
            Review recorded security and workflow events.
          </div>
        </button>
      </section>

      {/* ============================================================
          RECENT SECURITY EVENTS
      ============================================================ */}

      {recentAlerts.length > 0 && (
        <section className="bg-white border border-slate-300">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />

                <h2 className="text-xs font-black uppercase tracking-[0.1em] text-[#102a43]">
                  Recent Security Events
                </h2>
              </div>

              <p className="text-[10px] text-slate-500 mt-1">
                Security-related events recorded by the system.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('audit')}
              className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-[#163a5f] hover:underline"
            >
              Open Audit
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-200">
            {recentAlerts.slice(0, 4).map((log: any) => (
              <div
                key={log.id}
                className="px-5 py-3.5 flex items-start gap-3"
              >
                <div className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-slate-800">
                      {log.action || 'Security Event'}
                    </span>

                    <span className="text-[8px] font-mono text-slate-400">
                      {log.timestamp
                        ? formatDateTime(log.timestamp)
                        : 'Timestamp unavailable'}
                    </span>
                  </div>

                  <p className="text-[9px] text-slate-500 mt-1">
                    {log.user_name || 'System user'} ·{' '}
                    {log.ip_address || 'Source unavailable'}
                  </p>

                  {log.details?.denialReason && (
                    <p className="text-[9px] text-red-600 mt-1">
                      {log.details.denialReason}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============================================================
          FOOTER NOTICE
      ============================================================ */}

      <div className="px-4 py-3 border border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Scale className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />

          <div>
            <div className="text-[9px] font-bold text-slate-700 uppercase tracking-wide">
              Controlled Investigation Environment
            </div>

            <div className="text-[9px] text-slate-500 mt-0.5">
              Access to records is subject to role, assignment, jurisdiction
              and applicable case controls.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('audit')}
          className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-[#163a5f] hover:underline shrink-0"
        >
          Review Security Audit
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export default DashboardView;