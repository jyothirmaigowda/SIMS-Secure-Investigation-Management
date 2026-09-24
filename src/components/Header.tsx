import React, { useState } from 'react';
import {
  ShieldCheck,
  Bell,
  Search,
  LogOut,
  ChevronDown,
  Lock,
  Building2,
  UserRound,
  ChevronRight,
} from 'lucide-react';
import { User, NotificationItem } from '../types.ts';
import { api } from '../lib/api.ts';

interface HeaderProps {
  currentUser: User | null;
  onLogout: () => void;
  onNavigate: (route: string) => void;
  unreadNotifsCount: number;
  currentRoute?: string;
  activeCaseNumber?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onLogout,
  onNavigate,
  unreadNotifsCount,
  currentRoute = 'dashboard',
  activeCaseNumber,
}) => {
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadNotifications = () => {
    api
      .getNotifications()
      .then((res) => setNotifications(res.notifications))
      .catch(() => {});
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = searchQuery.trim();

    if (!query) {
      return;
    }

    onNavigate(`search?q=${encodeURIComponent(query)}`);
    setSearchQuery('');
  };

  const closeMenus = () => {
    setShowPersonaMenu(false);
    setShowNotifMenu(false);
  };

  const getBreadcrumbLabel = () => {
    if (activeCaseNumber) {
      return `Case No. ${activeCaseNumber}`;
    }

    switch (currentRoute) {
      case 'dashboard':
        return 'Dashboard';
      case 'cases':
        return 'Case Management';
      case 'evidence':
        return 'Evidence Register';
      case 'documents':
        return 'Document Management';
      case 'timeline':
        return 'Investigation Timeline';
      case 'reports':
        return 'Review & Reports';
      case 'audit':
        return 'Security Audit';
      case 'notifications':
        return 'Notifications';
      case 'search':
        return 'Search Records';
      case 'profile':
        return 'Officer Profile';
      case 'users':
        return 'User & Role Administration';
      case 'assignments':
        return 'Case Assignments';
      case 'system':
        return 'System Administration';
      default:
        return 'Investigation Workspace';
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'SYSTEM ADMINISTRATOR';
      case 'SUPERVISOR':
        return 'SUPERVISORY OFFICER';
      case 'LEGAL':
        return 'LEGAL OFFICER';
      case 'IO':
      default:
        return 'INVESTIGATING OFFICER';
    }
  };

  const getInitials = (name?: string) => {
    if (!name) {
      return 'SO';
    }

    return name
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const handleLogout = () => {
    closeMenus();
    onLogout();
  };

  const handleProfile = () => {
    closeMenus();
    onNavigate('profile');
  };

  const breadcrumbLabel = getBreadcrumbLabel();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-300 shadow-sm">
      {/* Institutional security strip */}
      <div className="min-h-8 bg-[#0b2545] text-white px-4 sm:px-5 lg:px-7 flex items-center justify-between gap-4 text-[9px] sm:text-[10px] tracking-wide">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-300 shrink-0" />

          <span className="font-black uppercase tracking-[0.14em] shrink-0">
            SIMS
          </span>

          <span className="hidden sm:inline text-slate-500">|</span>

          <span className="hidden sm:inline text-slate-300 truncate">
            Secure Investigation Management System
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-5 shrink-0">
          <span className="hidden md:flex items-center gap-1.5 text-slate-300">
            <Lock className="w-3 h-3 text-emerald-300" />
            SECURE SESSION
          </span>

          <span className="hidden lg:inline text-slate-400">
            SHA-256 INTEGRITY
          </span>

          <span className="font-black text-sky-300 tracking-[0.1em]">
            RESTRICTED ACCESS
          </span>
        </div>
      </div>

      {/* Main header */}
      <div className="min-h-[78px] px-4 sm:px-5 lg:px-7 flex items-center gap-4">
        {/* Breadcrumb / page identity */}
        <div className="flex-1 min-w-[180px] overflow-hidden">
          <div className="flex items-center gap-2 text-[9px] sm:text-[10px] uppercase tracking-[0.1em] text-slate-400 font-semibold whitespace-nowrap">
            <span>SIMS</span>

            <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />

            <span className="hidden sm:inline">
              Investigation Workspace
            </span>

            <ChevronRight className="hidden sm:block w-3 h-3 text-slate-300 shrink-0" />

            <span className="text-slate-500 truncate">
              {breadcrumbLabel}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-2 min-w-0">
            <h1
              className="text-[14px] sm:text-[15px] font-bold text-[#102a43] whitespace-nowrap"
              title={breadcrumbLabel}
            >
              {breadcrumbLabel}
            </h1>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 border border-emerald-200 bg-emerald-50 text-emerald-700 text-[8px] font-bold uppercase tracking-[0.1em] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Secure
            </span>
          </div>
        </div>

        {/* Header controls */}
        <div className="flex items-center gap-2 lg:gap-3 shrink-0">
          {/* Desktop search */}
          <form
            onSubmit={handleSearchSubmit}
            className="relative hidden md:block"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />

            <input
              type="text"
              placeholder="Search cases, documents, evidence..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-48 lg:w-64 xl:w-72 h-9 pl-9 pr-3 bg-slate-50 border border-slate-300 text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#163a5f] focus:ring-1 focus:ring-[#163a5f]/20 transition-colors"
              aria-label="Search records"
            />
          </form>

          {/* Jurisdiction */}
          {currentUser && (
            <div className="hidden 2xl:flex items-center gap-2 h-9 px-3 border border-slate-300 bg-white">
              <Building2 className="w-3.5 h-3.5 text-[#163a5f]" />

              <div>
                <div className="text-[8px] uppercase tracking-[0.12em] text-slate-400 leading-none">
                  Jurisdiction
                </div>

                <div className="text-[10px] font-bold text-[#163a5f] mt-1 font-mono">
                  {currentUser.jurisdiction}
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const nextState = !showNotifMenu;

                setShowNotifMenu(nextState);
                setShowPersonaMenu(false);

                if (nextState) {
                  loadNotifications();
                }
              }}
              className="relative w-9 h-9 flex items-center justify-center border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
              title="Notifications"
              aria-label="Notifications"
              aria-expanded={showNotifMenu}
            >
              <Bell className="w-4 h-4" />

              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-[#b42318] text-white text-[9px] font-bold border-2 border-white">
                  {unreadNotifsCount > 99 ? '99+' : unreadNotifsCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-1.5rem)] bg-white border border-slate-300 shadow-2xl">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-[#f8fafc]">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#102a43]">
                      System Notifications
                    </div>

                    <div className="text-[9px] text-slate-500 mt-1">
                      Security, review and workflow events
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      closeMenus();
                      onNavigate('notifications');
                    }}
                    className="text-[9px] font-bold uppercase tracking-wide text-[#163a5f] hover:underline shrink-0"
                  >
                    View All
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <Bell className="w-5 h-5 text-slate-300 mx-auto mb-2" />

                      <p className="text-[11px] text-slate-500">
                        No recent notifications.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const isCritical =
                        notification.severity === 'ALERT' ||
                        notification.severity === 'CRITICAL';

                      const isWarning =
                        notification.severity === 'WARNING';

                      return (
                        <div
                          key={notification.id}
                          className={`px-4 py-3 border-b border-slate-100 ${
                            isCritical
                              ? 'bg-red-50'
                              : isWarning
                                ? 'bg-amber-50'
                                : 'bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-[11px] font-bold text-slate-800 leading-snug">
                              {notification.title}
                            </div>

                            <span
                              className={`text-[8px] font-mono font-bold shrink-0 ${
                                isCritical
                                  ? 'text-red-700'
                                  : isWarning
                                    ? 'text-amber-700'
                                    : 'text-slate-500'
                              }`}
                            >
                              {notification.severity}
                            </span>
                          </div>

                          <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">
                            {notification.message}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Officer menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowPersonaMenu(!showPersonaMenu);
                setShowNotifMenu(false);
              }}
              className="h-9 flex items-center gap-2 px-2 border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
              aria-label="Officer account menu"
              aria-expanded={showPersonaMenu}
            >
              <div className="w-7 h-7 bg-[#163a5f] text-white flex items-center justify-center text-[9px] font-bold">
                {getInitials(currentUser?.full_name)}
              </div>

              <div className="hidden lg:block text-left">
                <div className="text-[10px] font-bold text-[#102a43] max-w-[120px] truncate">
                  {currentUser?.full_name || 'Officer'}
                </div>

                <div className="text-[8px] text-slate-500 uppercase tracking-wide">
                  {getRoleLabel(currentUser?.role)}
                </div>
              </div>

              <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:block" />
            </button>

            {showPersonaMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-300 shadow-2xl">
                <div className="px-4 py-4 bg-[#f3f7fb] border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#163a5f] text-white flex items-center justify-center text-xs font-bold">
                      {getInitials(currentUser?.full_name)}
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold text-xs text-[#102a43] truncate">
                        {currentUser?.full_name || 'Officer'}
                      </div>

                      <div className="text-[9px] text-slate-500 uppercase tracking-wide mt-1">
                        {getRoleLabel(currentUser?.role)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-2">
                  <button
                    type="button"
                    onClick={handleProfile}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[11px] text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <UserRound className="w-4 h-4 text-[#163a5f]" />
                    Officer Profile
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[11px] text-red-700 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Terminate Session
                  </button>
                </div>

                <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
                  <div className="flex justify-between text-[8px] font-mono text-slate-500">
                    <span>ACCESS</span>

                    <span className="font-bold text-emerald-700">
                      AUTHORIZED
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Direct logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="hidden lg:flex w-9 h-9 items-center justify-center border border-slate-300 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors"
            title="Terminate Session"
            aria-label="Terminate session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile search */}
      <div className="md:hidden px-4 pb-3">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />

          <input
            type="text"
            placeholder="Search cases, documents, evidence..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-300 text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#163a5f] focus:ring-1 focus:ring-[#163a5f]/20"
            aria-label="Search records"
          />
        </form>
      </div>
    </header>
  );
};