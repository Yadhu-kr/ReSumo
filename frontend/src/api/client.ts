/**
 * ReSumo API Client.
 * Typed fetch wrapper pointed at FastAPI backend (configurable via VITE_API_BASE_URL).
 */
import type {
  Candidate,
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

  actionApproval: (approvalId: string, actionReq: ApprovalActionRequest) =>
    request<Approval>(`/approvals/${encodeURIComponent(approvalId)}/action`, {
      method: "POST",
      body: JSON.stringify(actionReq),
    }),

  listApprovalPolicies: (roleTier?: RoleTier) => {
    const query = roleTier ? `?role_tier=${encodeURIComponent(roleTier)}` : "";
    return request<ApprovalPolicy[]>(`/approvals/policies${query}`);
  },
};
