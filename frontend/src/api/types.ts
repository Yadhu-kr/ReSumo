/**
 * ReSumo TypeScript domain types matching FastAPI Pydantic schemas.
 */

export type RoleTier = "junior" | "mid" | "senior" | "exec";

export type SeniorityLevel = "junior" | "mid" | "senior" | "lead" | "principal";

export type UserRole = "candidate" | "hr" | "approver" | "admin";

export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  company_id?: string | null;
  approver_role?: ApproverRole | null;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  created_at: string;
}

export interface UserRegisterPayload {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
  company_name?: string;
  company_id?: string;
  approver_role?: ApproverRole;
}

export interface UserUpdatePayload {
  name?: string;
  role?: UserRole;
  approver_role?: ApproverRole | null;
}

export interface UserLoginPayload {
  email: string;
  password: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
}

export interface Application {
  id: string;
  candidate_id: string;
  job_id: string;
  status: CandidateStatus;
  similarity_score?: number | null;
  rationale?: string | null;
  rationale_source?: string | null;
  created_at: string;
}

export type CandidateStatus =
  | "uploaded"
  | "parsed"
  | "shortlisted"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "extraction_failed";

export type ApproverRole = "hiring_manager" | "director" | "vp" | "ceo";

export type ApprovalAction = "approve" | "reject";

export interface ParsedResumeData {
  current_title: string;
  previous_titles: string[];
  current_company: string;
  previous_companies: string[];
  years_experience: number;
  seniority: SeniorityLevel;
  primary_domain: string;
  industries: string[];
  core_skills: string[];
  secondary_skills: string[];
  tools?: string[] | null;
  leadership_experience: boolean;
  key_achievements: string[];
  location?: string | null;
  summary: string;
}

export interface Candidate {
  id: string;
  job_id?: string | null;
  name?: string | null;
  email?: string | null;
  raw_resume_filename: string;
  raw_text?: string | null;
  parsed_data?: ParsedResumeData | null;
  parsed_status?: string | null;
  status: CandidateStatus;
  created_at: string;
  applications?: Application[];
}

export interface Job {
  id: string;
  title: string;
  description: string;
  role_tier: RoleTier;
  created_at: string;
}

export interface JobCreate {
  title: string;
  description: string;
  role_tier: RoleTier;
}

export interface CandidateMatchOut {
  candidate: Candidate;
  application: Application;
  similarity_score: number;
  similarity_percentage: number;
  rationale: string;
  rationale_source: "groq" | "claude" | "mock";
  status_updated?: boolean;
}

export interface JobMatchesResponse {
  job_id: string;
  job_title: string;
  matches: CandidateMatchOut[];
  count: number;
}

export interface MatchRequest {
  top_k?: number;
  min_score?: number;
}

export interface Approval {
  id: string;
  application_id: string;
  candidate_id?: string;
  approver_role: ApproverRole;
  step_order: number;
  action: "pending" | "approved" | "rejected";
  notes?: string | null;
  acted_at?: string | null;
  created_at: string;
  application?: Application;
}

export interface ApprovalPolicy {
  id: string;
  role_tier: RoleTier;
  step_order: number;
  approver_role: ApproverRole;
  created_at: string;
}

export interface ApprovalActionRequest {
  action: ApprovalAction;
  notes?: string | null;
}

export interface SubmitForApprovalResponse {
  application_id: string;
  candidate_id?: string;
  status: string;
  current_approval: Approval;
  message: string;
}

export interface UploadResumeResponse {
  candidate_id: string;
  filename: string;
  status: string;
  message: string;
}
