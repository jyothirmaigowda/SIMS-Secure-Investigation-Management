import React, { useState, useEffect } from 'react';
import { api } from './lib/api.ts';
import { User } from './types.ts';
import { Header } from './components/Header.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { DashboardView } from './components/views/DashboardView.tsx';
import { CasesView } from './components/views/CasesView.tsx';
import { CaseWorkspace } from './components/case/CaseWorkspace.tsx';
import { EvidenceView } from './components/views/EvidenceView.tsx';
import { DocumentsView } from './components/views/DocumentsView.tsx';
import { TimelineView } from './components/views/TimelineView.tsx';
import { ReportsView } from './components/views/ReportsView.tsx';
import { AuditView } from './components/views/AuditView.tsx';
import { NotificationsView } from './components/views/NotificationsView.tsx';
import { SearchView } from './components/views/SearchView.tsx';
import { ProfileView } from './components/views/ProfileView.tsx';
import { LoginView } from './components/views/LoginView.tsx';

import { NewCaseModal } from './components/modals/NewCaseModal.tsx';
import { NewEvidenceModal } from './components/modals/NewEvidenceModal.tsx';
import { NewDocumentModal } from './components/modals/NewDocumentModal.tsx';
import { NewTimelineModal } from './components/modals/NewTimelineModal.tsx';
import { NewReviewModal } from './components/modals/NewReviewModal.tsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [currentRoute, setCurrentRoute] = useState('dashboard');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [metrics, setMetrics] = useState<any>({
    activeCases: 3,
    pendingSupervisorReview: 1,
    pendingLegalReview: 1,
    totalEvidence: 3,
    totalDocuments: 3,
    securityAlerts: 1,
  });
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(1);

  // Modals state
  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [newEvidenceModalOpen, setNewEvidenceModalOpen] = useState(false);
  const [newDocModalOpen, setNewDocModalOpen] = useState(false);
  const [newTimelineModalOpen, setNewTimelineModalOpen] = useState(false);
  const [newReviewModalOpen, setNewReviewModalOpen] = useState(false);
  const [modalTargetCaseId, setModalTargetCaseId] = useState<string | undefined>(undefined);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
  setLoadingUser(true);

  try {
    const res = await api.getMe();

    if (res.user) {
      setCurrentUser(res.user);
      refreshMetrics();
    } else {
      setCurrentUser(null);
    }
  } catch (error) {
    console.error('Session check failed:', error);
    setCurrentUser(null);
  } finally {
    setLoadingUser(false);
  }
};

  const refreshMetrics = () => {
    api.getDashboardStats()
      .then((res) => {
        if (res.metrics) setMetrics(res.metrics);
      })
      .catch(() => {});

    api.getNotifications()
      .then((res) => {
        const unread = res.notifications.filter((n: any) => !n.is_read).length;
        setUnreadNotifsCount(unread);
      })
      .catch(() => {});
  };


  const handleLogout = async () => {
    try {
      await api.logout();
      setCurrentUser(null);
    } catch (err) {
      console.error(err);
      setCurrentUser(null);
    }
  };

  const navigateTo = (route: string) => {
    if (route.startsWith('cases/')) {
      const id = route.split('/')[1];
      setActiveCaseId(id);
      setCurrentRoute('case-workspace');
    } else if (route.startsWith('search')) {
      const q = new URLSearchParams(route.split('?')[1] || '').get('q') || '';
      setSearchQuery(q);
      setCurrentRoute('search');
    } else {
      setActiveCaseId(null);
      setCurrentRoute(route);
    }
  };

  const handleOpenNewEvidence = (caseId?: string) => {
    setModalTargetCaseId(caseId);
    setNewEvidenceModalOpen(true);
  };

  const handleOpenNewDoc = (caseId?: string) => {
    setModalTargetCaseId(caseId);
    setNewDocModalOpen(true);
  };

  const handleOpenNewTimeline = (caseId?: string) => {
    setModalTargetCaseId(caseId);
    setNewTimelineModalOpen(true);
  };

  const handleOpenNewReview = (caseId?: string) => {
    setModalTargetCaseId(caseId);
    setNewReviewModalOpen(true);
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center text-slate-800">
        <div className="text-center space-y-3 bg-white p-8 rounded-xl border border-slate-200 shadow-xs">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono text-slate-500 tracking-wider uppercase font-semibold">
            Initializing SIMS Secure Environment...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
  return (
    <LoginView
      onLogin={(user) => {
        setCurrentUser(user);
        refreshMetrics();
      }}
    />
  );
}

  return (
    <div className="w-full min-h-screen bg-[#f1f5f9] flex font-sans text-slate-900 overflow-hidden">
      {/* Left Navigation Sidebar */}
      <Sidebar
        currentRoute={currentRoute}
        onNavigate={navigateTo}
        metrics={metrics}
      />

      {/* Main Column: Header + Stage */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <Header
          currentUser={currentUser}
          onLogout={handleLogout}
          onNavigate={navigateTo}
          unreadNotifsCount={unreadNotifsCount}
          currentRoute={currentRoute}
        />

        {/* Main Workspace Stage */}
        <main className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8 bg-[#f1f5f9] text-slate-900 scrollbar-thin">
          <div className="max-w-7xl mx-auto space-y-6">
            {currentRoute === 'dashboard' && (
              <DashboardView
                currentUser={currentUser}
                onNavigate={navigateTo}
                onOpenNewCase={() => setNewCaseModalOpen(true)}
                onOpenNewEvidence={() => handleOpenNewEvidence()}
              />
            )}

            {currentRoute === 'cases' && (
              <CasesView
                onOpenCase={(id) => navigateTo(`cases/${id}`)}
                onOpenNewCase={() => setNewCaseModalOpen(true)}
              />
            )}

            {currentRoute === 'case-workspace' && activeCaseId && (
              <CaseWorkspace
                caseId={activeCaseId}
                currentUser={currentUser}
                onBack={() => navigateTo('cases')}
                onOpenNewEvidence={handleOpenNewEvidence}
                onOpenNewDocument={handleOpenNewDoc}
                onOpenNewTimeline={handleOpenNewTimeline}
                onOpenNewReview={handleOpenNewReview}
              />
            )}

            {currentRoute === 'evidence' && (
              <EvidenceView
                onOpenCase={(id) => navigateTo(`cases/${id}`)}
                onOpenNewEvidence={() => handleOpenNewEvidence()}
              />
            )}

            {currentRoute === 'documents' && (
              <DocumentsView
                currentUser={currentUser}
                onOpenCase={(id) => navigateTo(`cases/${id}`)}
                onOpenNewDocument={() => handleOpenNewDoc()}
              />
            )}

            {currentRoute === 'timeline' && (
              <TimelineView
                onOpenCase={(id) => navigateTo(`cases/${id}`)}
                onOpenNewTimeline={() => handleOpenNewTimeline()}
              />
            )}

            {currentRoute === 'reports' && (
              <ReportsView
                currentUser={currentUser}
                onOpenCase={(id) => navigateTo(`cases/${id}`)}
                onOpenNewReview={handleOpenNewReview}
              />
            )}

            {currentRoute === 'audit' && (
              <AuditView onOpenCase={(id) => navigateTo(`cases/${id}`)} />
            )}

            {currentRoute === 'notifications' && (
              <NotificationsView
                onOpenCase={(id) => navigateTo(`cases/${id}`)}
                onRefreshUnreadCount={refreshMetrics}
              />
            )}

            {currentRoute === 'search' && (
              <SearchView
                initialQuery={searchQuery}
                onOpenCase={(id) => navigateTo(`cases/${id}`)}
              />
            )}

            {currentRoute === 'profile' && (
              <ProfileView currentUser={currentUser} />
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      <NewCaseModal
        isOpen={newCaseModalOpen}
        onClose={() => setNewCaseModalOpen(false)}
        currentUser={currentUser}
        onSuccess={(newId) => {
          refreshMetrics();
          navigateTo(`cases/${newId}`);
        }}
      />

      <NewEvidenceModal
        isOpen={newEvidenceModalOpen}
        onClose={() => setNewEvidenceModalOpen(false)}
        preselectedCaseId={modalTargetCaseId}
        onSuccess={() => {
          refreshMetrics();
        }}
      />

      <NewDocumentModal
        isOpen={newDocModalOpen}
        onClose={() => setNewDocModalOpen(false)}
        preselectedCaseId={modalTargetCaseId}
        onSuccess={() => {
          refreshMetrics();
        }}
      />

      <NewTimelineModal
        isOpen={newTimelineModalOpen}
        onClose={() => setNewTimelineModalOpen(false)}
        preselectedCaseId={modalTargetCaseId}
        onSuccess={() => {
          refreshMetrics();
        }}
      />

      <NewReviewModal
        isOpen={newReviewModalOpen}
        onClose={() => setNewReviewModalOpen(false)}
        preselectedCaseId={modalTargetCaseId}
        onSuccess={() => {
          refreshMetrics();
        }}
      />
    </div>
  );
}
