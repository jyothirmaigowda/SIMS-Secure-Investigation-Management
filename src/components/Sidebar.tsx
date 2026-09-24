import React from 'react';
import {
  LayoutDashboard,
  FolderLock,
  FileText,
  Archive,
  Clock,
  FileSpreadsheet,
  History,
  Bell,
  Search,
  UserCheck,
  ShieldCheck,
  ChevronRight,
  Users,
  ClipboardCheck,
  Settings,
} from 'lucide-react';

interface SidebarUser {
  role?: string;
}

interface SidebarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  currentUser?: SidebarUser | null;
  metrics?: {
    activeCases?: number;
    pendingSupervisorReview?: number;
    pendingLegalReview?: number;
    totalEvidence?: number;
    totalDocuments?: number;
    securityAlerts?: number;
  };
}

type NavItem = {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  badge?: string | null;
};

type Role = 'IO' | 'SUPERVISOR' | 'LEGAL' | 'ADMIN';

const normalizeRole = (role?: string): Role | null => {
  if (!role) return null;

  const normalized = role.toUpperCase().replace(/[\s-]+/g, '_');

  if (normalized === 'IO' || normalized === 'INVESTIGATION_OFFICER') {
    return 'IO';
  }

  if (normalized === 'SUPERVISOR' || normalized === 'SUPERVISING_OFFICER') {
    return 'SUPERVISOR';
  }

  if (normalized === 'LEGAL' || normalized === 'LEGAL_TEAM') {
    return 'LEGAL';
  }

  if (normalized === 'ADMIN' || normalized === 'ADMINISTRATOR') {
    return 'ADMIN';
  }

  return null;
};

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  currentUser,
  metrics,
}) => {
  const role = normalizeRole(currentUser?.role);

  /*
   * Navigation is an interface-level control only.
   * Backend authorization remains the actual security boundary.
   *
   * When the user role is unavailable during initial loading, the
   * existing navigation remains visible rather than accidentally
   * hiding legitimate routes.
   */

  const canSee = (allowedRoles: Role[]) => {
    if (!role) return true;
    return allowedRoles.includes(role);
  };

  const mainOperations: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      description:
        role === 'IO'
          ? 'Investigation overview'
          : role === 'SUPERVISOR'
            ? 'Supervisory overview'
            : role === 'LEGAL'
              ? 'Legal workspace'
              : role === 'ADMIN'
                ? 'System overview'
                : 'System overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'cases',
      label: 'Case Management',
      description: 'Authorized case records',
      icon: FolderLock,
      badge: metrics?.activeCases
        ? `${metrics.activeCases} active`
        : null,
    },
    {
      id: 'evidence',
      label: 'Evidence Register',
      description:
        role === 'LEGAL'
          ? 'Evidence review & integrity'
          : role === 'SUPERVISOR'
            ? 'Evidence oversight'
            : 'Digital evidence',
      icon: Archive,
      badge: metrics?.totalEvidence
        ? `${metrics.totalEvidence}`
        : null,
    },
    {
      id: 'documents',
      label: 'Documents',
      description:
        role === 'LEGAL'
          ? 'Legal records'
          : role === 'SUPERVISOR'
            ? 'Case documentation'
            : 'Official records',
      icon: FileText,
      badge: metrics?.totalDocuments
        ? `${metrics.totalDocuments}`
        : null,
    },
  ].filter((item) => {
    if (item.id === 'evidence') {
      return canSee(['IO', 'SUPERVISOR', 'LEGAL', 'ADMIN']);
    }

    if (item.id === 'documents') {
      return canSee(['IO', 'SUPERVISOR', 'LEGAL', 'ADMIN']);
    }

    return true;
  });

  const investigationTools: NavItem[] = [
    {
      id: 'timeline',
      label: 'Investigation Timeline',
      description:
        role === 'IO'
          ? 'Events & investigation diary'
          : role === 'SUPERVISOR'
            ? 'Investigation progress'
            : 'Case chronology',
      icon: Clock,
      badge: null,
    },
    {
      id: 'reports',
      label: 'Review & Reports',
      description:
        role === 'IO'
          ? 'Submission & case reports'
          : role === 'SUPERVISOR'
            ? 'Supervisory review'
            : role === 'LEGAL'
              ? 'Legal review & reports'
              : 'Reports & oversight',
      icon: FileSpreadsheet,
      badge:
        metrics?.pendingSupervisorReview || metrics?.pendingLegalReview
          ? `${(metrics?.pendingSupervisorReview || 0) +
              (metrics?.pendingLegalReview || 0)} pending`
          : null,
    },
    {
      id: 'audit',
      label: 'Security Audit',
      description:
        role === 'ADMIN'
          ? 'System security activity'
          : 'Authorized activity record',
      icon: History,
      badge: role === 'ADMIN' ? 'VERIFY' : 'VIEW',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      description: 'Security & workflow alerts',
      icon: Bell,
      badge: metrics?.securityAlerts
        ? `${metrics.securityAlerts}`
        : null,
    },
  ].filter((item) => {
    if (item.id === 'timeline') {
      return canSee(['IO', 'SUPERVISOR', 'LEGAL', 'ADMIN']);
    }

    if (item.id === 'reports') {
      return canSee(['IO', 'SUPERVISOR', 'LEGAL', 'ADMIN']);
    }

    if (item.id === 'audit') {
      return canSee(['SUPERVISOR', 'LEGAL', 'ADMIN']);
    }

    return true;
  });

  const administrativeTools: NavItem[] = [
    {
      id: 'users',
      label: 'User & Role Administration',
      description: 'Accounts & access control',
      icon: Users,
      badge: null,
    },
    {
      id: 'assignments',
      label: 'Case Assignments',
      description: 'Officer assignments',
      icon: ClipboardCheck,
      badge: null,
    },
    {
      id: 'system',
      label: 'System Administration',
      description: 'Security & configuration',
      icon: Settings,
      badge: null,
    },
  ].filter(() => canSee(['ADMIN']));

  const utilities: NavItem[] = [
    {
      id: 'search',
      label: 'Search Records',
      description: 'Authorized records',
      icon: Search,
    },
    {
      id: 'profile',
      label: 'Officer Profile',
      description: 'Identity & clearance',
      icon: UserCheck,
    },
  ];

  const isActive = (id: string) => {
    if (id === 'cases') {
      return currentRoute === 'cases' || currentRoute.startsWith('cases/');
    }

    return currentRoute === id;
  };

  const renderNavGroup = (title: string, items: NavItem[]) => {
    if (items.length === 0) return null;

    return (
      <section>
        <div className="px-4 mb-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
          {title}
        </div>

        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.id);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`group relative w-full flex items-center gap-3 px-4 py-2.5 text-left border-l-2 transition-all ${
                  active
                    ? 'bg-[#183b60] border-sky-400 text-white'
                    : 'border-transparent text-slate-300 hover:bg-[#173653] hover:text-white'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active
                      ? 'text-sky-300'
                      : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div
                    className={`text-[11px] font-semibold truncate ${
                      active ? 'text-white' : 'text-slate-300'
                    }`}
                  >
                    {item.label}
                  </div>

                  {item.description && (
                    <div
                      className={`text-[8px] mt-0.5 truncate ${
                        active
                          ? 'text-slate-300'
                          : 'text-slate-500 group-hover:text-slate-400'
                      }`}
                    >
                      {item.description}
                    </div>
                  )}
                </div>

                {item.badge && (
                  <span
                    className={`shrink-0 px-1.5 py-0.5 border text-[8px] font-mono font-bold ${
                      active
                        ? 'border-sky-700 bg-sky-950/40 text-sky-200'
                        : item.id === 'notifications'
                          ? 'border-red-900/70 bg-red-950/50 text-red-300'
                          : item.id === 'audit'
                            ? 'border-emerald-900/70 bg-emerald-950/40 text-emerald-300'
                            : 'border-slate-700 bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {active && (
                  <ChevronRight className="w-3 h-3 text-sky-300 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <aside className="w-[272px] bg-[#0b1f33] text-slate-300 flex flex-col shrink-0 min-h-screen border-r border-[#183b57] select-none">
      {/* Institutional Brand */}
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className="w-full px-5 py-5 border-b border-[#183b57] text-left hover:bg-[#102a43] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border border-sky-700 bg-[#102a43] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-sky-300" />
          </div>

          <div className="min-w-0">
            <div className="text-[14px] font-black tracking-[0.08em] text-white">
              SIMS
            </div>

            <div className="text-[8px] uppercase tracking-[0.12em] text-slate-400 mt-0.5">
              Secure Investigation
            </div>

            <div className="text-[8px] uppercase tracking-[0.12em] text-slate-500">
              Management System
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#183b57] flex items-center justify-between">
          <span className="text-[8px] font-mono text-slate-500">
            INSTITUTIONAL EDITION
          </span>

          <span className="text-[8px] font-mono text-sky-500">
            v2.6
          </span>
        </div>
      </button>

      {/* Navigation */}
      <nav
        className="flex-1 py-5 overflow-y-auto scrollbar-thin"
        aria-label="Primary navigation"
      >
        <div className="space-y-6">
          {renderNavGroup('Primary Operations', mainOperations)}
          {renderNavGroup(
            role === 'ADMIN'
              ? 'Security & Oversight'
              : 'Investigation & Review',
            investigationTools,
          )}
          {renderNavGroup('Administration', administrativeTools)}
          {renderNavGroup('Utilities', utilities)}
        </div>
      </nav>

      {/* Security Status */}
      <div className="border-t border-[#183b57] p-4">
        <div className="border border-[#245477] bg-[#102a43]">
          <div className="px-3 py-2 border-b border-[#245477] flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-300">
              Security Status
            </span>

            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>

          <div className="px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400">
                Evidence Integrity
              </span>

              <span className="text-[9px] font-mono font-bold text-emerald-300">
                SHA-256
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400">
                Access Control
              </span>

              <span className="text-[9px] font-mono font-bold text-emerald-300">
                ACTIVE
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400">
                Audit Trail
              </span>

              <span className="text-[9px] font-mono font-bold text-emerald-300">
                APPEND-ONLY
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};