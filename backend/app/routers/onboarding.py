"""
Post-Offer Onboarding Checklist Router.

Manages the new hire onboarding journey following offer acceptance:
- Compliance & I-9 identity verification
- Tax withholding (W-4)
- Direct deposit banking setup
- Confidentiality & IP agreements
- IT workstation & equipment selection
- First-day orientation & buddy sync
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, require_role
from app.services.notifications import notify_onboarding_verified

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

DEFAULT_ONBOARDING_TASKS = [
    {
        "title": "I-9 Employment Verification & Government ID",
        "category": "compliance",
        "description": "Upload a valid government-issued photo ID (Passport, Driver's License, or Real ID) for federal employment eligibility verification.",
        "due_days": 3,
    },
    {
        "title": "Federal & State Tax Withholding (Form W-4)",
        "category": "compliance",
        "description": "Specify filing status (Single, Married, Head of Household) and any additional withholding allowances for accurate tax deduction.",
        "due_days": 5,
    },
    {
        "title": "Direct Deposit & Payroll Banking Details",
        "category": "banking",
        "description": "Enter your primary financial institution routing number and checking/savings account number for semi-monthly automated direct deposit.",
        "due_days": 5,
    },
    {
        "title": "Confidentiality & IP Assignment Agreement",
        "category": "agreements",
        "description": "Review proprietary information, non-disclosure provisions, and intellectual property assignment covenants, then provide digital signature.",
        "due_days": 7,
    },
    {
        "title": "Workstation & Engineering Hardware Selection",
        "category": "it_provisioning",
        "description": "Choose your primary company workstation (e.g., Apple M3 Max MacBook Pro 16\" or Lenovo ThinkPad X1 Carbon) and provide equipment delivery address.",
        "due_days": 4,
    },
    {
        "title": "First-Week Orientation & Onboarding Buddy Setup",
        "category": "orientation",
        "description": "Review day 1 start time (9:30 AM), virtual welcome meet & greet with your team lead, and pair programming buddy assignment.",
        "due_days": 10,
    },
]


def initialize_candidate_onboarding(
    db: Session,
    candidate_id: str,
    application_id: Optional[str] = None,
    company_id: Optional[str] = None,
) -> list[models.OnboardingTask]:
    """
    Seeds default onboarding tasks for a candidate.
    Idempotent: returns existing tasks if already initialized.
    """
    existing = (
        db.query(models.OnboardingTask)
        .filter(models.OnboardingTask.candidate_id == candidate_id)
        .order_by(models.OnboardingTask.created_at.asc())
        .all()
    )
    if existing:
        return existing

    created_tasks = []
    for item in DEFAULT_ONBOARDING_TASKS:
        task = models.OnboardingTask(
            candidate_id=candidate_id,
            application_id=application_id,
            company_id=company_id,
            title=item["title"],
            category=item["category"],
            description=item["description"],
            status="pending",
            due_days=item["due_days"],
        )
        db.add(task)
        created_tasks.append(task)

    db.commit()
    for task in created_tasks:
        db.refresh(task)
    return created_tasks


def build_onboarding_summary(
    candidate_id: str,
    tasks: list[models.OnboardingTask],
    application_id: Optional[str] = None,
) -> schemas.OnboardingSummaryOut:
    """Helper to compute progress percentage and task counts."""
    total = len(tasks)
    completed = sum(1 for t in tasks if t.status in ("completed", "verified"))
    verified = sum(1 for t in tasks if t.status == "verified")
    percentage = round((completed / total) * 100, 1) if total > 0 else 0.0
    is_complete = total > 0 and completed == total

    return schemas.OnboardingSummaryOut(
        candidate_id=candidate_id,
        application_id=application_id,
        total_tasks=total,
        completed_tasks=completed,
        verified_tasks=verified,
        progress_percentage=percentage,
        is_complete=is_complete,
        tasks=[schemas.OnboardingTaskOut.model_validate(t) for t in tasks],
    )


@router.post("/initialize/{candidate_id}", response_model=schemas.OnboardingSummaryOut)
def initialize_onboarding_endpoint(
    candidate_id: str,
    application_id: Optional[str] = None,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """Initializes or retrieves the standard onboarding task list for a candidate."""
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate '{candidate_id}' not found",
        )

    tasks = initialize_candidate_onboarding(
        db=db,
        candidate_id=candidate_id,
        application_id=application_id,
        company_id=current_user.company_id,
    )
    return build_onboarding_summary(candidate_id, tasks, application_id)


@router.get("/candidate/{candidate_id}", response_model=schemas.OnboardingSummaryOut)
def get_candidate_onboarding(
    candidate_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves the onboarding checklist and progress for a candidate.
    Accessible to HR, Admin, Approvers, and the candidate themselves.
    """
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate '{candidate_id}' not found",
        )

    # Candidate self-access check
    if current_user.role == "candidate":
        if candidate.user_id != current_user.id and candidate.email != current_user.email:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    tasks = (
        db.query(models.OnboardingTask)
        .filter(models.OnboardingTask.candidate_id == candidate_id)
        .order_by(models.OnboardingTask.created_at.asc())
        .all()
    )

    # If no tasks exist yet, auto-initialize only if candidate has been offered or hired
    if not tasks:
        has_offer_or_hired = (
            db.query(models.Application)
            .filter(
                models.Application.candidate_id == candidate_id,
                models.Application.status.in_(["hired", "offered"]),
            )
            .first()
            is not None
            or db.query(models.Offer)
            .filter(
                models.Offer.candidate_id == candidate_id,
                models.Offer.status.in_(["accepted", "sent"]),
            )
            .first()
            is not None
        )
        if has_offer_or_hired:
            tasks = initialize_candidate_onboarding(
                db=db,
                candidate_id=candidate_id,
                company_id=current_user.company_id,
            )

    return build_onboarding_summary(candidate_id, tasks)


@router.get("/me", response_model=schemas.OnboardingSummaryOut)
def get_my_onboarding(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Candidate endpoint to retrieve their active onboarding checklist.
    """
    candidate = (
        db.query(models.Candidate)
        .filter(
            (models.Candidate.user_id == current_user.id)
            | (models.Candidate.email == current_user.email)
        )
        .first()
    )
    if not candidate:
        # Return empty summary if candidate profile doesn't exist yet
        return schemas.OnboardingSummaryOut(
            candidate_id="",
            total_tasks=0,
            completed_tasks=0,
            verified_tasks=0,
            progress_percentage=0.0,
            is_complete=False,
            tasks=[],
        )

    tasks = (
        db.query(models.OnboardingTask)
        .filter(models.OnboardingTask.candidate_id == candidate.id)
        .order_by(models.OnboardingTask.created_at.asc())
        .all()
    )

    if not tasks:
        has_offer_or_hired = (
            db.query(models.Application)
            .filter(
                models.Application.candidate_id == candidate.id,
                models.Application.status.in_(["hired", "offered"]),
            )
            .first()
            is not None
            or db.query(models.Offer)
            .filter(
                models.Offer.candidate_id == candidate.id,
                models.Offer.status.in_(["accepted", "sent"]),
            )
            .first()
            is not None
        )
        if has_offer_or_hired:
            tasks = initialize_candidate_onboarding(
                db=db,
                candidate_id=candidate.id,
                company_id=candidate.company_id if hasattr(candidate, "company_id") else None,
            )

    return build_onboarding_summary(candidate.id, tasks)


@router.patch("/tasks/{task_id}", response_model=schemas.OnboardingTaskOut)
def update_onboarding_task(
    task_id: str,
    payload: schemas.OnboardingTaskUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Updates an onboarding task status (e.g. marked completed) and attaches submitted form data.
    """
    task = db.query(models.OnboardingTask).filter(models.OnboardingTask.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Onboarding task '{task_id}' not found",
        )

    # If candidate, verify ownership
    if current_user.role == "candidate":
        cand = db.query(models.Candidate).filter(models.Candidate.id == task.candidate_id).first()
        if not cand or (cand.user_id != current_user.id and cand.email != current_user.email):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if payload.form_data is not None:
        merged = dict(task.form_data or {})
        merged.update(payload.form_data)
        task.form_data = merged

    if payload.status:
        if payload.status == "verified" and current_user.role not in ("hr", "admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR or Administrators can verify onboarding compliance tasks",
            )
        task.status = payload.status
        if payload.status in ("completed", "verified") and not task.completed_at:
            task.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(task)
    return task


@router.post("/tasks/{task_id}/verify", response_model=schemas.OnboardingTaskOut)
def verify_onboarding_task(
    task_id: str,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    HR / Admin marks an onboarding task (e.g., I-9 compliance, tax forms) as formally verified.
    """
    task = db.query(models.OnboardingTask).filter(models.OnboardingTask.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Onboarding task '{task_id}' not found",
        )

    task.status = "verified"
    task.verified_at = datetime.now(timezone.utc)
    if not task.completed_at:
        task.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(task)

    try:
        cand = db.query(models.Candidate).filter(models.Candidate.id == task.candidate_id).first()
        cand_email = (cand.email if cand else None) or (cand.user.email if cand and cand.user else None)
        if cand and cand_email:
            notify_onboarding_verified(
                db=db,
                task=task,
                candidate=cand,
                candidate_email=cand_email,
            )
    except Exception:
        pass

    return task
