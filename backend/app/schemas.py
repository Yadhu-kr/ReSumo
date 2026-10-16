"""
Pydantic schemas for request/response bodies.
Covers auth, companies, users, jobs, candidates, applications, approvals.
"""
from datetime import datetime
from typing import Optional, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, EmailStr

RoleTier = Literal["junior", "mid", "senior", "exec"]
UserRole = Literal["candidate", "hr", "approver", "admin"]
ApproverRole = Literal["hiring_manager", "director", "vp", "ceo"]
ApplicationStatus = Literal[
    "uploaded",
    "parsed",
    "shortlisted",
    "pending_approval",
    "approved",
    "offered",
    "hired",
    "rejected",
]
ApprovalAction = Literal["approve", "reject"]
ApprovalStatus = Literal["pending", "approved", "rejected"]


# ---- Auth ----

class UserRegister(BaseModel):
    email: str = Field(..., min_length=5, description="User email address")
    password: str = Field(..., min_length=8, description="Password (min 8 chars)")
    name: Optional[str] = Field(None, description="User full display name")
    role: UserRole = "hr"
    company_name: Optional[str] = Field(None, description="Create new company (HR signup)")
    company_id: Optional[str] = Field(None, description="Join existing company (HR/approver)")
    approver_role: Optional[ApproverRole] = Field(None, description="Required for approver role")


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[UserRole] = None
    approver_role: Optional[ApproverRole] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: Optional[str] = None
    role: str
    company_id: Optional[str] = None
    approver_role: Optional[str] = None
    created_at: datetime


# ---- Companies ----

class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


# ---- Jobs ----

class JobCreate(BaseModel):
    title: str = Field(..., min_length=1, description="Job title")
    description: str = Field(..., min_length=1, description="Job description")
    role_tier: RoleTier = "junior"


class JobUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, description="Updated job title")
    description: Optional[str] = Field(None, min_length=1, description="Updated job description")
    role_tier: Optional[RoleTier] = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    role_tier: str
    company_id: str
    created_at: datetime


# ---- Resume Extraction Model Output (Contract: sandeeppanem/resume-json-extraction-5k) ----

SeniorityLevel = Literal["junior", "mid", "senior", "lead", "principal"]


class ParsedResumeData(BaseModel):
    """
    Exact schema output by the fine-tuned QLoRA extraction model.
    Note: name, email, and phone are intentionally excluded from this model output.
    """
    model_config = ConfigDict(extra="ignore")

    current_title: str
    previous_titles: list[str] = Field(default_factory=list)
    current_company: str
    previous_companies: list[str] = Field(default_factory=list)
    years_experience: float
    seniority: SeniorityLevel
    primary_domain: str
    industries: list[str] = Field(default_factory=list)
    core_skills: list[str] = Field(default_factory=list)
    secondary_skills: list[str] = Field(default_factory=list)
    tools: Optional[list[str]] = None
    leadership_experience: bool = False
    key_achievements: list[str] = Field(default_factory=list)
    location: Optional[str] = None
    summary: str


# ---- Candidates ----

class CandidateUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    raw_text: Optional[str] = None
    parsed_data: Optional[ParsedResumeData | dict[str, Any]] = None
    parsed_status: Optional[str] = None


# ---- Applications ----

class ApplicationStatusUpdate(BaseModel):
    status: ApplicationStatus
    notes: Optional[str] = None


class CandidateAssignJobRequest(BaseModel):
    job_id: str
    initial_status: ApplicationStatus = "shortlisted"


# Forward declaration placeholder for OfferOut
class OfferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    candidate_id: str
    application_id: Optional[str] = None
    role_title: Optional[str] = None
    salary: Optional[float] = None
    currency: Optional[str] = "USD"
    start_date: Optional[str] = None
    equity: Optional[str] = None
    offer_letter_text: Optional[str] = None
    document_path: Optional[str] = None
    status: str
    notes: Optional[str] = None
    responded_at: Optional[datetime] = None
    created_at: datetime


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    candidate_id: str
    job_id: str
    status: str
    similarity_score: Optional[float] = None
    rationale: Optional[str] = None
    rationale_source: Optional[str] = None
    created_at: datetime
    job: Optional[JobOut] = None
    offers: list[OfferOut] = []


class CandidateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    raw_resume_filename: str
    raw_text: Optional[str] = None
    parsed_data: Optional[ParsedResumeData | dict[str, Any]] = None
    parsed_status: Optional[str] = "uploaded"
    created_at: datetime
    applications: list[ApplicationOut] = []
    job_id: Optional[str] = None
    status: Optional[str] = None


class UploadResumeResponse(BaseModel):
    candidate_id: str
    filename: str
    status: str
    message: str


# ---- Phase 2 RAG Matching Schemas ----

class MatchRequest(BaseModel):
    top_k: int = Field(default=5, ge=1, le=50, description="Number of top candidate matches to retrieve")
    min_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Minimum cosine similarity score threshold")


class CandidateMatchOut(BaseModel):
    candidate: CandidateOut
    application: ApplicationOut
    similarity_score: float
    similarity_percentage: float
    rationale: str
    rationale_source: Literal["groq", "claude", "mock"] = "mock"


class JobMatchesResponse(BaseModel):
    job_id: str
    job_title: str
    matches: list[CandidateMatchOut]
    count: int


# ---- Phase 3 HITL Approval Workflow Schemas ----

class ApprovalActionRequest(BaseModel):
    action: ApprovalAction
    notes: Optional[str] = None


class ApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    application_id: str
    approver_role: str
    step_order: int
    action: str
    notes: Optional[str] = None
    acted_by_user_id: Optional[str] = None
    acted_at: Optional[datetime] = None
    created_at: datetime
    candidate_id: Optional[str] = None
    application: Optional[ApplicationOut] = None


class ApprovalPolicyCreate(BaseModel):
    role_tier: RoleTier
    step_order: int = Field(default=1, ge=1)
    approver_role: ApproverRole


class ApprovalPolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role_tier: str
    step_order: int
    approver_role: str
    created_at: datetime


class SubmitForApprovalResponse(BaseModel):
    application_id: str
    status: str
    current_approval: ApprovalOut
    message: str


# ---- Phase 4 Offer Generation Schemas ----

OfferStatus = Literal["draft", "sent", "accepted", "declined"]


class OfferGenerateRequest(BaseModel):
    application_id: str
    salary: float = Field(..., gt=0, description="Annual base salary")
    currency: str = Field(default="USD", description="Currency code (USD, EUR, GBP, INR, etc.)")
    start_date: str = Field(..., description="Target employment start date (YYYY-MM-DD)")
    equity: Optional[str] = Field(None, description="Equity or stock grant details")
    role_title: Optional[str] = Field(None, description="Official job title override")
    benefits_summary: Optional[str] = Field(None, description="Healthcare, 401k, PTO details")
    notes: Optional[str] = Field(None, description="Special terms, sign-on bonus, or comments")


class OfferRespondRequest(BaseModel):
    action: Literal["accept", "decline"]
    notes: Optional[str] = None


# ---- Phase 5 Interview Scorecard Schemas ----

InterviewRecommendation = Literal[
    "strong_hire",
    "hire",
    "lean_hire",
    "lean_no_hire",
    "no_hire",
]


class DimensionScoreIn(BaseModel):
    dimension: str
    score: float = Field(..., ge=1.0, le=5.0)
    notes: Optional[str] = None


class InterviewScorecardCreate(BaseModel):
    candidate_id: str
    application_id: Optional[str] = None
    interviewer_name: Optional[str] = None
    recommendation: InterviewRecommendation = "hire"
    overall_notes: Optional[str] = None
    dimensions: list[DimensionScoreIn]


class InterviewScoreOut(BaseModel):
    id: str
    candidate_id: str
    application_id: Optional[str] = None
    interviewer_id: Optional[str] = None
    interviewer_name: Optional[str] = None
    dimension: str
    score: float
    baseline_score: Optional[float] = None
    finetuned_score: Optional[float] = None
    recommendation: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CandidateScorecardSummary(BaseModel):
    candidate_id: str
    application_id: Optional[str] = None
    average_score: float
    total_evaluations: int
    recommendation_consensus: str
    dimension_averages: dict[str, float]
    scores: list[InterviewScoreOut]


# ---- Post-Offer Onboarding Schemas ----

OnboardingCategory = Literal[
    "compliance",
    "banking",
    "agreements",
    "it_provisioning",
    "orientation",
]

OnboardingStatus = Literal[
    "pending",
    "in_progress",
    "completed",
    "verified",
]


class OnboardingTaskUpdate(BaseModel):
    status: Optional[OnboardingStatus] = None
    form_data: Optional[dict[str, Any]] = None


class OnboardingTaskOut(BaseModel):
    id: str
    candidate_id: str
    application_id: Optional[str] = None
    company_id: Optional[str] = None
    title: str
    category: str
    description: Optional[str] = None
    status: str
    due_days: int
    completed_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    form_data: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OnboardingSummaryOut(BaseModel):
    candidate_id: str
    application_id: Optional[str] = None
    total_tasks: int
    completed_tasks: int
    verified_tasks: int
    progress_percentage: float
    is_complete: bool
    tasks: list[OnboardingTaskOut]


# ---- Interview Calendar Schemas ----

class InterviewScheduleCreate(BaseModel):
    candidate_id: str
    job_id: Optional[str] = None
    application_id: Optional[str] = None
    interviewer_id: Optional[str] = None
    interviewer_name: Optional[str] = None
    title: Optional[str] = "Technical Architecture & Coding Interview"
    round_type: Optional[str] = "technical"
    start_time: datetime
    duration_minutes: Optional[int] = 45
    meeting_link: Optional[str] = None
    notes: Optional[str] = None


class InterviewScheduleUpdate(BaseModel):
    status: Optional[str] = None  # scheduled/completed/cancelled
    meeting_link: Optional[str] = None
    notes: Optional[str] = None


class InterviewScheduleOut(BaseModel):
    id: str
    company_id: Optional[str] = None
    job_id: Optional[str] = None
    candidate_id: str
    application_id: Optional[str] = None
    interviewer_id: Optional[str] = None
    interviewer_name: Optional[str] = None
    title: str
    round_type: str
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    meeting_link: Optional[str] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---- Notification Schemas ----

class NotificationOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    recipient_email: str
    subject: str
    body_text: str
    body_html: Optional[str] = None
    notification_type: str
    reference_id: Optional[str] = None
    is_read: bool
    delivery_status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TestEmailRequest(BaseModel):
    recipient_email: str
    subject: str
    message: str


# ---- Candidate Notes & Activity Timeline Schemas ----

class CandidateNoteCreate(BaseModel):
    content: str


class CandidateNoteOut(BaseModel):
    id: str
    candidate_id: str
    author_id: str
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TimelineEventOut(BaseModel):
    id: str
    event_type: str
    title: str
    description: str
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    timestamp: datetime
    metadata: Optional[dict] = None


class CandidateTimelineResponse(BaseModel):
    candidate_id: str
    events: list[TimelineEventOut]
    notes: list[CandidateNoteOut]


class UnreadCountResponse(BaseModel):
    unread_count: int

