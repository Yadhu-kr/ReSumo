/**
 * ReSumo API Client.
 * Typed fetch wrapper pointed at FastAPI backend (configurable via VITE_API_BASE_URL).
 */
import type {
  Candidate,
  Application,
  Job,
  JobCreate,
  JobMatchesResponse,
  MatchRequest,
  Approval,
  ApprovalActionRequest,
  ApprovalPolicy,
  SubmitForApprovalResponse,
  UploadResumeResponse,
  ApproverRole,
  RoleTier,
  User,
  UserRegisterPayload,
  UserUpdatePayload,
  UserLoginPayload,
  AuthTokenResponse,
  Offer,
  OfferGenerateRequest,
  OfferRespondRequest,
  CandidateStatus,
  InterviewScorecardCreate,
  CandidateScorecardSummary,
  OnboardingTaskUpdate,
  OnboardingTask,
  OnboardingSummary,
  InterviewSchedule,
  InterviewScheduleCreate,
  AppNotification,
} from "./types";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const TOKEN_KEY = "resumo_auth_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});

  const token = getStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") {
        errorDetail = data.detail;
      } else if (Array.isArray(data.detail)) {
        errorDetail = data.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(", ");
      } else if (data.detail) {
        errorDetail = JSON.stringify(data.detail);
      }
    } catch {
      // Body not JSON
    }
    throw new ApiError(response.status, errorDetail);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export const api = {
  // Health
  checkHealth: () => request<{ status: string }>("/health"),

  // Authentication & Profile
  register: (payload: UserRegisterPayload) =>
    request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (payload: UserLoginPayload) =>
    request<AuthTokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getMe: () => request<User>("/auth/me"),

  updateMe: (payload: UserUpdatePayload) =>
    request<User>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  // Resumes & Ingestion
  uploadResume: (file: File, jobId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (jobId) {
      formData.append("job_id", jobId);
    }
    return request<UploadResumeResponse>("/upload-resume", {
      method: "POST",
      body: formData,
    });
  },

  // Candidates
  listCandidates: (jobId?: string) => {
    const query = jobId ? `?job_id=${encodeURIComponent(jobId)}` : "";
    return request<Candidate[]>(`/candidates/${query}`);
  },

  getCandidate: (candidateId: string) =>
    request<Candidate>(`/candidates/${encodeURIComponent(candidateId)}`),

  getCandidateApplications: (candidateId: string) =>
    request<Application[]>(`/candidates/${encodeURIComponent(candidateId)}/applications`),

  patchCandidate: (candidateId: string, patch: Partial<Candidate>) =>
    request<Candidate>(`/candidates/${encodeURIComponent(candidateId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  submitForApproval: (candidateId: string) =>
    request<SubmitForApprovalResponse>(
      `/candidates/${encodeURIComponent(candidateId)}/submit-for-approval`,
      {
        method: "POST",
      }
    ),

  submitApplicationForApproval: (applicationId: string) =>
    request<SubmitForApprovalResponse>(
      `/candidates/applications/${encodeURIComponent(applicationId)}/submit-for-approval`,
      {
        method: "POST",
      }
    ),

  // Jobs
  listJobs: () => request<Job[]>("/jobs/"),

  getJob: (jobId: string) => request<Job>(`/jobs/${encodeURIComponent(jobId)}`),

  createJob: (job: JobCreate) =>
    request<Job>("/jobs/", {
      method: "POST",
      body: JSON.stringify(job),
    }),

  deleteJob: (jobId: string) =>
    request<void>(`/jobs/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    }),

  // Phase 2 RAG Matching
  matchCandidates: (jobId: string, req: MatchRequest = { top_k: 5, min_score: 0.0 }) =>
    request<JobMatchesResponse>(`/jobs/${encodeURIComponent(jobId)}/matches`, {
      method: "POST",
      body: JSON.stringify(req),
    }),

  // Phase 3 Approvals
  listPendingApprovals: (role?: ApproverRole) => {
    const query = role ? `?role=${encodeURIComponent(role)}` : "";
    return request<Approval[]>(`/approvals/pending${query}`);
  },

  getCandidateApprovals: (candidateId: string) =>
    request<Approval[]>(`/approvals/candidate/${encodeURIComponent(candidateId)}`),

  getApplicationApprovals: (applicationId: string) =>
    request<Approval[]>(`/approvals/application/${encodeURIComponent(applicationId)}`),

  actionApproval: (approvalId: string, actionReq: ApprovalActionRequest) =>
    request<Approval>(`/approvals/${encodeURIComponent(approvalId)}/action`, {
      method: "POST",
      body: JSON.stringify(actionReq),
    }),

  listApprovalPolicies: (roleTier?: RoleTier) => {
    const query = roleTier ? `?role_tier=${encodeURIComponent(roleTier)}` : "";
    return request<ApprovalPolicy[]>(`/approvals/policies${query}`);
  },

  // Candidate Self-Application
  applyForJob: (jobId: string) =>
    request<Application>(`/jobs/${encodeURIComponent(jobId)}/apply`, {
      method: "POST",
    }),

  getMyApplications: () =>
    request<Application[]>("/candidates/me/applications"),

  // Interactive Kanban & Manual Actions
  updateApplicationStatus: (applicationId: string, status: CandidateStatus, notes?: string) =>
    request<Application>(`/candidates/applications/${encodeURIComponent(applicationId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, notes }),
    }),

  assignCandidateToJob: (candidateId: string, jobId: string, initialStatus: CandidateStatus = "shortlisted") =>
    request<Application>(`/candidates/${encodeURIComponent(candidateId)}/assign-job`, {
      method: "POST",
      body: JSON.stringify({ job_id: jobId, initial_status: initialStatus }),
    }),

  // Phase 4 Offers
  generateOffer: (payload: OfferGenerateRequest) =>
    request<Offer>("/offers/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getOffer: (offerId: string) =>
    request<Offer>(`/offers/${encodeURIComponent(offerId)}`),

  getApplicationOffer: (applicationId: string) =>
    request<Offer>(`/offers/application/${encodeURIComponent(applicationId)}`),

  getCandidateOffers: (candidateId: string) =>
    request<Offer[]>(`/offers/candidate/${encodeURIComponent(candidateId)}`),

  sendOffer: (offerId: string) =>
    request<Offer>(`/offers/${encodeURIComponent(offerId)}/send`, {
      method: "POST",
    }),

  respondToOffer: (offerId: string, req: OfferRespondRequest) =>
    request<Offer>(`/offers/${encodeURIComponent(offerId)}/respond`, {
      method: "POST",
      body: JSON.stringify(req),
    }),

  getOfferDownloadUrl: (offerId: string) =>
    `${BASE_URL}/offers/${encodeURIComponent(offerId)}/download`,

  // Phase 5 Interviews & Scorecards
  submitInterviewScorecard: (payload: InterviewScorecardCreate) =>
    request<CandidateScorecardSummary>("/interviews/scorecards", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getCandidateScorecard: (candidateId: string, applicationId?: string) =>
    request<CandidateScorecardSummary>(
      applicationId
        ? `/interviews/candidate/${encodeURIComponent(candidateId)}?application_id=${encodeURIComponent(applicationId)}`
        : `/interviews/candidate/${encodeURIComponent(candidateId)}`
    ),

  getApplicationScorecard: (applicationId: string) =>
    request<CandidateScorecardSummary>(`/interviews/application/${encodeURIComponent(applicationId)}`),

  deleteInterviewScore: (scoreId: string) =>
    request<void>(`/interviews/${encodeURIComponent(scoreId)}`, {
      method: "DELETE",
    }),

  // Post-Offer Onboarding
  initializeOnboarding: (candidateId: string, applicationId?: string) =>
    request<OnboardingSummary>(
      applicationId
        ? `/onboarding/initialize/${encodeURIComponent(candidateId)}?application_id=${encodeURIComponent(applicationId)}`
        : `/onboarding/initialize/${encodeURIComponent(candidateId)}`,
      { method: "POST" }
    ),

  getCandidateOnboarding: (candidateId: string) =>
    request<OnboardingSummary>(`/onboarding/candidate/${encodeURIComponent(candidateId)}`),

  getMyOnboarding: () =>
    request<OnboardingSummary>("/onboarding/me"),

  updateOnboardingTask: (taskId: string, payload: OnboardingTaskUpdate) =>
    request<OnboardingTask>(`/onboarding/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  verifyOnboardingTask: (taskId: string) =>
    request<OnboardingTask>(`/onboarding/tasks/${encodeURIComponent(taskId)}/verify`, {
      method: "POST",
    }),

  // Phase 6 Interview Calendar
  scheduleInterview: (payload: InterviewScheduleCreate) =>
    request<InterviewSchedule>("/calendar/schedule", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getCandidateSchedules: (candidateId: string) =>
    request<InterviewSchedule[]>(`/calendar/candidate/${encodeURIComponent(candidateId)}`),

  getApplicationSchedules: (applicationId: string) =>
    request<InterviewSchedule[]>(`/calendar/application/${encodeURIComponent(applicationId)}`),

  getMySchedules: () =>
    request<InterviewSchedule[]>("/calendar/my-schedules"),

  updateSchedule: (scheduleId: string, payload: { status?: string; meeting_link?: string; notes?: string }) =>
    request<InterviewSchedule>(`/calendar/schedules/${encodeURIComponent(scheduleId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getScheduleIcsUrl: (scheduleId: string) =>
    `${BASE_URL}/calendar/schedules/${encodeURIComponent(scheduleId)}/ics`,

  // Phase 6 Notifications
  getMyNotifications: () =>
    request<AppNotification[]>("/notifications/me"),

  markNotificationRead: (notificationId: string) =>
    request<AppNotification>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "PATCH",
    }),

  markAllNotificationsRead: () =>
    request<{ message: string }>("/notifications/mark-all-read", {
      method: "POST",
    }),

  sendTestEmail: (payload: { recipient_email: string; subject: string; message: string }) =>
    request<AppNotification>("/notifications/test-email", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
