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
    "parsed",
    "shortlisted",
    "pending_approval",
    "approved",
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
    raw_text: Optional[str] = None
    parsed_data: Optional[ParsedResumeData | dict[str, Any]] = None
    parsed_status: Optional[str] = None


# ---- Applications ----

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


class CandidateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
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
