/**
 * ReSumo TypeScript domain types matching FastAPI Pydantic schemas.
 */

export type RoleTier = "junior" | "mid" | "senior" | "exec";

export type SeniorityLevel = "junior" | "mid" | "senior" | "lead" | "principal";

export type UserRole = "candidate" | "hr" | "approver" | "interviewer" | "admin";

export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  secondary_roles?: string[] | null;
  company_id?: string | null;
  approver_role?: ApproverRole | null;
  created_at: string;
}

export interface UserGovernance {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  secondary_roles?: string[] | null;
  approver_role?: ApproverRole | null;
  company_id?: string | null;
  created_at: string;
}

export interface UserRoleGovernanceUpdate {
  role?: string;
  secondary_roles?: string[];
  approver_role?: string;
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

export type CandidateStatus =
  | "uploaded"
  | "parsed"
  | "shortlisted"
  | "pending_approval"
  | "approved"
  | "offered"
  | "hired"
  | "rejected"
  | "extraction_failed";

export type OfferStatus = "draft" | "sent" | "accepted" | "declined";

export interface Offer {
  id: string;
  candidate_id: string;
  application_id?: string | null;
  role_title?: string | null;
  salary?: number | null;
  currency?: string;
  start_date?: string | null;
  equity?: string | null;
  offer_letter_text?: string | null;
  document_path?: string | null;
  status: OfferStatus;
  notes?: string | null;
  responded_at?: string | null;
  created_at: string;
}

export interface OfferGenerateRequest {
  application_id: string;
  salary: number;
  currency?: string;
  start_date: string;
  equity?: string;
  role_title?: string;
  benefits_summary?: string;
  notes?: string;
}

export interface OfferRespondRequest {
  action: "accept" | "decline";
  notes?: string;
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
  job?: Job;
  offers?: Offer[];
}

export interface CandidateAssignJobRequest {
  job_id: string;
  initial_status?: CandidateStatus;
}

export interface ApplicationStatusUpdateRequest {
  status: CandidateStatus;
  notes?: string;
}

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
  phone?: string | null;
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

// ---- Phase 5 Interview Scorecard Types ----

export type InterviewRecommendation =
  | "strong_hire"
  | "hire"
  | "lean_hire"
  | "lean_no_hire"
  | "no_hire";

export interface DimensionScoreIn {
  dimension: string;
  score: number;
  notes?: string;
  interview_type?: "technical" | "hr";
}

export interface InterviewScorecardCreate {
  candidate_id: string;
  application_id?: string;
  interviewer_name?: string;
  interview_type?: "technical" | "hr";
  recommendation: InterviewRecommendation;
  overall_notes?: string;
  dimensions: DimensionScoreIn[];
}

export interface InterviewScore {
  id: string;
  candidate_id: string;
  application_id?: string | null;
  interviewer_id?: string | null;
  interviewer_name?: string | null;
  dimension: string;
  interview_type?: string | null;
  score: number;
  baseline_score?: number | null;
  finetuned_score?: number | null;
  recommendation?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface CandidateScorecardSummary {
  candidate_id: string;
  application_id?: string | null;
  average_score: number;
  total_evaluations: number;
  recommendation_consensus: string;
  dimension_averages: Record<string, number>;
  scores: InterviewScore[];
  // Dual Side-by-Side & Circular Consensus metrics
  technical_score?: number | null;
  technical_dimension_averages?: Record<string, number>;
  technical_scores?: InterviewScore[];
  technical_consensus?: string;
  hr_score?: number | null;
  hr_dimension_averages?: Record<string, number>;
  hr_scores?: InterviewScore[];
  hr_consensus?: string;
  consensus_percentage?: number;
  consensus_badge?: string;
}

// ---- AI Dynamic Interview Question Types ----

export type InterviewRoundType =
  | "technical"
  | "system_design"
  | "behavioral"
  | "screening"
  | "executive";

export interface InterviewQuestionItem {
  id: string;
  category: string;
  question: string;
  what_to_look_for: string;
  suggested_dimension: string;
  difficulty: string;
  rationale?: string | null;
}

export interface GenerateInterviewQuestionsRequest {
  candidate_id: string;
  job_id?: string | null;
  round_type?: InterviewRoundType;
  custom_focus?: string | null;
}

export interface GenerateInterviewQuestionsResponse {
  candidate_id: string;
  job_id?: string | null;
  round_type: string;
  total_questions: number;
  questions: InterviewQuestionItem[];
  generated_at: string;
  model_provider: string;
}


// ---- Post-Offer Onboarding Types ----

export type OnboardingCategory =
  | "compliance"
  | "banking"
  | "agreements"
  | "it_provisioning"
  | "orientation"
  | "workstation"
  | "direct_deposit"
  | "w4_tax"
  | "i9_compliance"
  | "ip_agreement"
  | (string & {});

export type OnboardingStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "verified";

export interface OnboardingTaskUpdate {
  status?: OnboardingStatus;
  form_data?: Record<string, any>;
}

export interface OnboardingTask {
  id: string;
  candidate_id: string;
  application_id?: string | null;
  company_id?: string | null;
  title: string;
  category: OnboardingCategory;
  description?: string | null;
  status: OnboardingStatus;
  due_days: number;
  completed_at?: string | null;
  verified_at?: string | null;
  form_data?: Record<string, any> | null;
  created_at: string;
}

export interface OnboardingSummary {
  candidate_id: string;
  application_id?: string | null;
  total_tasks: number;
  completed_tasks: number;
  verified_tasks: number;
  progress_percentage: number;
  is_complete: boolean;
  tasks: OnboardingTask[];
}

export type OnboardingSummaryOut = OnboardingSummary;
export type OnboardingTaskOut = OnboardingTask;

// ---- Phase 6 Interview Calendar & Notification Types ----

export interface InterviewSchedule {
  id: string;
  company_id?: string | null;
  job_id?: string | null;
  candidate_id: string;
  application_id?: string | null;
  interviewer_id?: string | null;
  interviewer_name?: string | null;
  title: string;
  round_type: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  meeting_link?: string | null;
  status: "scheduled" | "completed" | "cancelled";
  notes?: string | null;
  created_at: string;
}

export interface InterviewScheduleCreate {
  candidate_id: string;
  application_id?: string | null;
  interviewer_id?: string | null;
  interviewer_name?: string | null;
  title?: string;
  round_type?: string;
  start_time: string;
  duration_minutes?: number;
  meeting_link?: string | null;
  notes?: string | null;
}

export interface AppNotification {
  id: string;
  user_id?: string | null;
  recipient_email: string;
  subject: string;
  body_text: string;
  body_html?: string | null;
  notification_type: string;
  reference_id?: string | null;
  is_read: boolean;
  delivery_status: string;
  created_at: string;
}

export interface CandidateNote {
  id: string;
  candidate_id: string;
  author_id: string;
  author_name?: string | null;
  author_role?: string | null;
  content: string;
  created_at: string;
}

export interface CandidateNoteCreate {
  content: string;
}

export interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  actor_name?: string | null;
  actor_role?: string | null;
  timestamp: string;
  metadata?: Record<string, any> | null;
}

export interface CandidateTimelineResponse {
  candidate_id: string;
  events: TimelineEvent[];
  notes: CandidateNote[];
}

export interface HiringPacketResponse {
  candidate_id: string;
  candidate_name: string;
  markdown: string;
}

export interface UnreadCountResponse {
  unread_count: number;
}


