async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (
    !headers.has('Content-Type') &&
    !(options.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error: any = new Error(
      data?.message ||
        data?.error ||
        `Request failed with status ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data as T;
}

async function downloadFile(
  url: string,
  filename: string
): Promise<void> {
  const headers = new Headers();

  const res = await fetch(url, {
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `Download failed (${res.status})`;

    try {
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await res.json();

        message =
          data?.message ||
          data?.error ||
          message;
      } else {
        const text = await res.text();

        if (text.trim()) {
          message = text.trim();
        }
      }
    } catch {
      // Keep the HTTP status message if the response body
      // cannot be parsed.
    }

    const error: any = new Error(message);

    error.status = res.status;
    error.url = url;

    throw error;
  }

  const blob = await res.blob();

  if (!blob.size) {
    throw new Error('Download failed: the server returned an empty file.');
  }

  const objUrl = window.URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.style.display = 'none';
  a.href = objUrl;
  a.download = filename;

  document.body.appendChild(a);

  a.click();

  a.remove();

  // Give the browser time to start the download before
  // releasing the object URL.
  window.setTimeout(() => {
    window.URL.revokeObjectURL(objUrl);
  }, 1000);
}

export const api = {
  // ============================================================
  // AUTH
  // ============================================================

  login: async (
    username: string,
    password: string,
    role?: string,
    captchaChallenge?: string,
    captchaAnswer?: string
  ) => {
    const res = await request<{
      success: boolean;
      user: any;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        role,
        captchaChallenge,
        captchaAnswer,
      }),
    });

    return res;
  },

  logout: async () => {
    const result = await request<{ success: boolean }>(
      '/api/auth/logout',
      {
        method: 'POST',
      }
    );

    return result;
  },

  getMe: async () => {
    const res = await request<{
      user: any;
    }>('/api/auth/me');

    return res;
  },

  getDemoUsers: () =>
    request<{
      users: any[];
    }>('/api/auth/demo-users'),

  getCaptcha: () =>
    request<{
      success: boolean;
      challengeId: string;
      image: string;
      expiresInSeconds: number;
    }>('/api/auth/captcha'),

  // ============================================================
  // CASES
  // ============================================================

  getCases: () =>
    request<{
      cases: any[];
    }>('/api/cases'),

  getCase: (id: string) =>
    request<{
      case: any;
      assignments: any[];
      readiness: any[];
    }>(`/api/cases/${id}`),

  createCase: (payload: any) =>
    request<{
      success: boolean;
      caseId: string;
      caseNumber: string;
    }>('/api/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCaseDisposition: (
    id: string,
    status: string,
    note?: string
  ) =>
    request<{
      success: boolean;
      newStatus: string;
    }>(`/api/cases/${id}/disposition`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        note,
      }),
    }),

  updateReadinessItem: (
    caseId: string,
    itemId: string,
    is_compliant: boolean,
    notes?: string
  ) =>
    request<{
      success: boolean;
    }>(
      `/api/cases/${caseId}/readiness/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          is_compliant,
          notes,
        }),
      }
    ),

  // ============================================================
  // EVIDENCE
  // ============================================================

  getEvidence: (caseId?: string) =>
    request<{
      evidence: any[];
    }>(
      caseId
        ? `/api/evidence?caseId=${encodeURIComponent(caseId)}`
        : '/api/evidence'
    ),

  getEvidenceItem: (id: string) =>
    request<{
      evidence: any;
      custodyChain: any[];
    }>(`/api/evidence/${id}`),

  registerEvidence: (
    data: FormData | any
  ) => {
    if (data instanceof FormData) {
      return request<{
        success: boolean;
        evidenceId: string;
        trackingNumber: string;
        sha256Hash: string;
      }>('/api/evidence', {
        method: 'POST',
        body: data,
      });
    }

    return request<{
      success: boolean;
      evidenceId: string;
      trackingNumber: string;
      sha256Hash: string;
    }>('/api/evidence', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  transferCustody: (
    id: string,
    payload: {
      transferred_to_id: string;
      action_type: string;
      reason: string;
      location: string;
    }
  ) =>
    request<{
      success: boolean;
      custodyId: string;
      signatureHash: string;
    }>(`/api/evidence/${id}/custody`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyEvidenceHash: (id: string) =>
    request<{
      verified: boolean;
      sha256Hash: string;
      status: string;
      message: string;
    }>(
      `/api/evidence/${id}/verify-hash`,
      {
        method: 'POST',
      }
    ),

  // ============================================================
  // DOCUMENTS
  // ============================================================

  getDocuments: (caseId?: string) =>
    request<{
      documents: any[];
    }>(
      caseId
        ? `/api/documents?caseId=${encodeURIComponent(caseId)}`
        : '/api/documents'
    ),

  getDocument: (id: string) =>
    request<{
      document: any;
    }>(`/api/documents/${id}`),

  getDocumentVersions: (id: string) =>
    request<{ versions: any[] }>(`/api/documents/${id}/versions`),

  createDocument: (
    payload: FormData | any
  ) => {
    if (payload instanceof FormData) {
      return request<{
        success: boolean;
        documentId: string;
        documentNumber: string;
        sha256Hash: string;
      }>('/api/documents', {
        method: 'POST',
        body: payload,
      });
    }

    return request<{
      success: boolean;
      documentId: string;
      documentNumber: string;
      sha256Hash: string;
    }>('/api/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  signDocument: (
    id: string,
    decision: 'APPROVED' | 'REJECTED'
  ) =>
    request<{
      success: boolean;
      status: string;
    }>(`/api/documents/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
      }),
    }),

  // ============================================================
  // TIMELINE
  // ============================================================

  getTimeline: (caseId?: string) =>
    request<{
      events: any[];
    }>(
      caseId
        ? `/api/timeline?caseId=${encodeURIComponent(caseId)}`
        : '/api/timeline'
    ),

  addTimelineEvent: (payload: any) =>
    request<{
      success: boolean;
      eventId: string;
    }>('/api/timeline', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ============================================================
  // INVESTIGATION DIARY
  // ============================================================

  getInvestigationDiary: (
    caseId: string
  ) =>
    request<{
      entries: any[];
    }>(
      `/api/investigation/diary?caseId=${encodeURIComponent(caseId)}`
    ),

  addDiaryEntry: (
    payload: {
      case_id: string;
      content: string;
    }
  ) =>
    request<{
      success: boolean;
      entryId: string;
    }>('/api/investigation/diary', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ============================================================
  // CASE REPORTS
  // ============================================================

  getReports: (caseId: string) =>
    request<{
      reports: any[];
    }>(
      `/api/reports?caseId=${encodeURIComponent(caseId)}`
    ),

  createReport: (
    payload: {
      case_id: string;
      title: string;
      report_type: string;
      content: string;
    }
  ) =>
    request<{
      success: boolean;
      reportId: string;
    }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitReport: (id: string) =>
    request<{
      success: boolean;
    }>(
      `/api/reports/${id}/submit`,
      {
        method: 'PATCH',
      }
    ),

  reviewReport: (
    id: string,
    decision: string,
    rejection_reason?: string
  ) =>
    request<{
      success: boolean;
    }>(`/api/reports/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({
        decision,
        rejection_reason,
      }),
    }),

  // ============================================================
  // REVIEWS
  // ============================================================

  getReviews: (caseId?: string) =>
    request<{
      reviews: any[];
    }>(
      caseId
        ? `/api/reviews?caseId=${encodeURIComponent(caseId)}`
        : '/api/reviews'
    ),

  submitReview: (payload: any) =>
    request<{
      success: boolean;
      reviewId: string;
      decision: string;
    }>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ============================================================
  // AUDIT
  // ============================================================

  getAuditLogs: (
    caseId?: string,
    limit = 50
  ) =>
    request<{
      logs: any[];
    }>(
      caseId
        ? `/api/audit?caseId=${encodeURIComponent(caseId)}&limit=${limit}`
        : `/api/audit?limit=${limit}`
    ),

  verifyAuditChain: () =>
    request<{
      verified: boolean;
      totalRecords: number;
      reason: string;
      latestHash: string;
      timestamp: string;
    }>('/api/audit/verify'),

  getCaseIntegrity: (caseId: string) =>
    request<{
      verified: boolean;
      records: any[];
      confirmedCount: number;
      pendingCount: number;
      reason: string;
      provider: string;
      label: string;
    }>(`/api/integrity/${encodeURIComponent(caseId)}`),

  // ============================================================
  // STATS & DASHBOARD
  // ============================================================

  getDashboardStats: () =>
    request<{
      metrics: any;
      recentCases: any[];
      recentAlerts: any[];
      currentUser: any;
    }>('/api/stats/dashboard'),

  // ============================================================
  // SEARCH
  // ============================================================

  search: (q: string) =>
    request<{
      cases: any[];
      evidence: any[];
      documents: any[];
      reports: any[];
    }>(
      `/api/search?q=${encodeURIComponent(q)}`
    ),

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  getNotifications: () =>
    request<{
      notifications: any[];
    }>('/api/notifications'),

  markNotificationRead: (id: string) =>
    request<{
      success: boolean;
    }>(
      `/api/notifications/${id}/read`,
      {
        method: 'PATCH',
      }
    ),

  // ============================================================
  // READINESS
  // ============================================================

  getReadiness: (caseId: string) =>
    request<any>(
      `/api/cases-ext/${caseId}/readiness`
    ),

  // ============================================================
  // CERTIFICATES
  // ============================================================

  getCertificates: (caseId: string) =>
    request<{
      certificates: any[];
    }>(
      `/api/cases-ext/${caseId}/certificates`
    ),

  createCertificate: (
    caseId: string,
    payload: {
      certifier_name: string;
      certifier_title: string;
      statement: string;
    }
  ) =>
    request<{
      success: boolean;
      certificateId: string;
    }>(
      `/api/cases-ext/${caseId}/certificates`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  // ============================================================
  // USERS
  // ============================================================

  getUsers: () =>
    request<{
      users: any[];
    }>('/api/users'),

  // ============================================================
  // DOWNLOADS
  // ============================================================

  downloadDocument: async (
    id: string,
    filename: string
  ) => {
    await downloadFile(
      `/api/documents/${id}/download`,
      filename
    );
  },

  downloadEvidence: async (
    id: string,
    filename: string
  ) => {
    await downloadFile(
      `/api/evidence/${id}/download`,
      filename
    );
  },
};
