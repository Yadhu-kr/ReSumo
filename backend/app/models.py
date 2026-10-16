"""
SQLAlchemy ORM models for the ReSumo recruitment platform.

Phase 0-3 original tables:  jobs, candidates, approvals, offers, interview_scores, approval_policies.
Phase Auth/Multi-tenancy:   companies, users, applications (new).

Restructured:
- Candidate: job_id/status removed → moved to Application. Gains user_id (FK to User).
- Job: gains company_id (FK to Company, required).
- Approval: candidate_id → application_id. Gains acted_by_user_id.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Float, JSON, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


# SQLite doesn't natively support Postgres UUID; using a variant allows tests
# to run in SQLite while keeping native PostgreSQL UUID in production.
UUID_TYPE = UUID(as_uuid=False).with_variant(String(36), "sqlite")


def gen_uuid():
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


# ---- New: Company & User ----

class Company(Base):
    __tablename__ = "companies"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now)

    users = relationship("User", back_populates="company")
    jobs = relationship("Job", back_populates="company")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # candidate / hr / approver / admin
    company_id = Column(UUID_TYPE, ForeignKey("companies.id"), nullable=True)
    # Only meaningful when role == "approver":
    approver_role = Column(String, nullable=True)  # hiring_manager / director / vp / ceo
    created_at = Column(DateTime, default=utc_now)

    company = relationship("Company", back_populates="users")


# ---- Restructured: Job (gains company_id) ----

class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    role_tier = Column(String, nullable=False, default="junior")  # junior/mid/senior/exec
    company_id = Column(UUID_TYPE, ForeignKey("companies.id"), nullable=False)
    created_at = Column(DateTime, default=utc_now)

    company = relationship("Company", back_populates="jobs")
    applications = relationship("Application", back_populates="job")


# ---- Restructured: Candidate (job_id/status removed → Application) ----

class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    user_id = Column(UUID_TYPE, ForeignKey("users.id"), nullable=True)

    # Denormalized legacy fields — name/email may be populated independently
    # of the User record (e.g. from resume parsing or manual entry).
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    raw_resume_filename = Column(String, nullable=False)

    # Plaintext extracted during ingestion pre-processing; feeds into QLoRA model.
    raw_text = Column(Text, nullable=True)

    # Structured JSON produced by the fine-tuned QLoRA extraction model.
    # Conforms to sandeeppanem/resume-json-extraction-5k schema:
    # {current_title, previous_titles, current_company, previous_companies,
    #  years_experience, seniority, primary_domain, industries, core_skills,
    #  secondary_skills, tools, leadership_experience, key_achievements, location, summary}
    # Note: Does not contain name, email, or phone (handled separately).
    parsed_data = Column(JSON, nullable=True)

    # Ingestion extraction status: "uploaded", "parsed", "extraction_failed"
    parsed_status = Column(String, default="uploaded", nullable=True)

    created_at = Column(DateTime, default=utc_now)

    user = relationship("User", backref="candidates")
    applications = relationship("Application", back_populates="candidate")

    @property
    def job_id(self):
        return self.applications[0].job_id if self.applications else None

    @property
    def status(self):
        return self.applications[0].status if self.applications else (self.parsed_status or "uploaded")


# ---- New: Application (bridges Candidate ↔ Job, owns status machine) ----

class Application(Base):
    __tablename__ = "applications"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    candidate_id = Column(UUID_TYPE, ForeignKey("candidates.id"), nullable=False)
    job_id = Column(UUID_TYPE, ForeignKey("jobs.id"), nullable=False)
    status = Column(String, default="parsed")
    # parsed → shortlisted → pending_approval → approved / rejected

    similarity_score = Column(Float, nullable=True)
    rationale = Column(Text, nullable=True)
    rationale_source = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    candidate = relationship("Candidate", back_populates="applications")
    job = relationship("Job", back_populates="applications")
    approvals = relationship("Approval", back_populates="application")


# ---- Restructured: Approval (candidate_id → application_id) ----

class Approval(Base):
    __tablename__ = "approvals"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    application_id = Column(UUID_TYPE, ForeignKey("applications.id"), nullable=False)
    approver_role = Column(String, nullable=False)  # hiring_manager/director/vp/ceo
    step_order = Column(Integer, default=1, nullable=False)
    action = Column(String, default="pending")  # pending/approved/rejected
    notes = Column(Text, nullable=True)
    acted_by_user_id = Column(UUID_TYPE, ForeignKey("users.id"), nullable=True)
    acted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    application = relationship("Application", back_populates="approvals")

    @property
    def candidate_id(self):
        return self.application.candidate_id if self.application else None
    acted_by_user = relationship("User", foreign_keys=[acted_by_user_id])


class ApprovalPolicy(Base):
    __tablename__ = "approval_policies"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    role_tier = Column(String, nullable=False)  # junior/mid/senior/exec
    step_order = Column(Integer, default=1, nullable=False)
    approver_role = Column(String, nullable=False)  # hiring_manager/director/vp/ceo
    created_at = Column(DateTime, default=utc_now)


# ---- Phase 4-5 Stubs (unchanged, FK to candidates.id) ----

class Offer(Base):
    __tablename__ = "offers"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    candidate_id = Column(UUID_TYPE, ForeignKey("candidates.id"), nullable=False)
    application_id = Column(UUID_TYPE, ForeignKey("applications.id"), nullable=True)
    role_title = Column(String, nullable=True)
    salary = Column(Float, nullable=True)
    currency = Column(String, default="USD")
    start_date = Column(String, nullable=True)
    equity = Column(String, nullable=True)
    offer_letter_text = Column(Text, nullable=True)
    document_path = Column(String, nullable=True)
    status = Column(String, default="draft")  # draft/sent/accepted/declined
    notes = Column(Text, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    candidate = relationship("Candidate", backref="offers")
    application = relationship("Application", backref="offers")


class InterviewScore(Base):
    __tablename__ = "interview_scores"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    candidate_id = Column(UUID_TYPE, ForeignKey("candidates.id"), nullable=False)
    application_id = Column(UUID_TYPE, ForeignKey("applications.id"), nullable=True)
    interviewer_id = Column(UUID_TYPE, ForeignKey("users.id"), nullable=True)
    interviewer_name = Column(String, nullable=True)
    dimension = Column(String, nullable=False)  # technical_depth/communication/role_fit/system_design/cultural_alignment
    score = Column(Float, nullable=False, default=3.0)  # 1.0 to 5.0
    baseline_score = Column(Float, nullable=True)
    finetuned_score = Column(Float, nullable=True)
    recommendation = Column(String, nullable=True)  # strong_hire/hire/lean_hire/lean_no_hire/no_hire
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    candidate = relationship("Candidate", backref="interview_scores")
    application = relationship("Application", backref="interview_scores")
    interviewer = relationship("User", foreign_keys=[interviewer_id])


class OnboardingTask(Base):
    __tablename__ = "onboarding_tasks"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    candidate_id = Column(UUID_TYPE, ForeignKey("candidates.id"), nullable=False)
    application_id = Column(UUID_TYPE, ForeignKey("applications.id"), nullable=True)
    company_id = Column(UUID_TYPE, ForeignKey("companies.id"), nullable=True)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)  # compliance/banking/agreements/it_provisioning/orientation
    description = Column(Text, nullable=True)
    status = Column(String, default="pending")  # pending/in_progress/completed/verified
    due_days = Column(Integer, default=7)
    completed_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    form_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    candidate = relationship("Candidate", backref="onboarding_tasks")
    application = relationship("Application", backref="onboarding_tasks")
    company = relationship("Company", foreign_keys=[company_id])


class InterviewSchedule(Base):
    __tablename__ = "interview_schedules"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    company_id = Column(UUID_TYPE, ForeignKey("companies.id"), nullable=True)
    job_id = Column(UUID_TYPE, ForeignKey("jobs.id"), nullable=True)
    candidate_id = Column(UUID_TYPE, ForeignKey("candidates.id"), nullable=False)
    application_id = Column(UUID_TYPE, ForeignKey("applications.id"), nullable=True)
    interviewer_id = Column(UUID_TYPE, ForeignKey("users.id"), nullable=True)
    interviewer_name = Column(String, nullable=True)
    title = Column(String, nullable=False, default="Technical Architecture & Coding Interview")
    round_type = Column(String, nullable=False, default="technical")  # screening/technical/system_design/cultural_fit/executive
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=45)
    meeting_link = Column(String, nullable=True)
    status = Column(String, default="scheduled")  # available/scheduled/completed/cancelled
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    candidate = relationship("Candidate", backref="schedules")
    application = relationship("Application", backref="schedules")
    job = relationship("Job", foreign_keys=[job_id])
    company = relationship("Company", foreign_keys=[company_id])
    interviewer = relationship("User", foreign_keys=[interviewer_id])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    user_id = Column(UUID_TYPE, ForeignKey("users.id"), nullable=True)
    recipient_email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body_text = Column(Text, nullable=False)
    body_html = Column(Text, nullable=True)
    notification_type = Column(String, nullable=False)  # offer_extended/offer_accepted/interview_scheduled/onboarding_update/general
    reference_id = Column(String, nullable=True)
    is_read = Column(Boolean, default=False)
    delivery_status = Column(String, default="sent")  # sent/logged/failed
    created_at = Column(DateTime, default=utc_now)

    user = relationship("User", backref="notifications")


class CandidateNote(Base):
    __tablename__ = "candidate_notes"

    id = Column(UUID_TYPE, primary_key=True, default=gen_uuid)
    candidate_id = Column(UUID_TYPE, ForeignKey("candidates.id"), nullable=False)
    author_id = Column(UUID_TYPE, ForeignKey("users.id"), nullable=False)
    author_name = Column(String, nullable=True)
    author_role = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now)

    candidate = relationship("Candidate", backref="notes")
    author = relationship("User", foreign_keys=[author_id])

