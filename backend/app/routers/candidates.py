from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("/", response_model=list[schemas.CandidateOut])
def list_candidates(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lists candidates scoped by role:
    - Candidate: sees only their own record(s).
    - HR/approver: sees candidates with Applications to their company's jobs.
    - Admin: sees all candidates.
    """
    if current_user.role == "candidate":
        return (
            db.query(models.Candidate)
            .filter(models.Candidate.user_id == current_user.id)
            .order_by(models.Candidate.created_at.desc())
            .all()
        )

    if current_user.role in ("hr", "approver"):
        # Candidates who have at least one application to this company's jobs
        return (
            db.query(models.Candidate)
            .join(models.Application, models.Application.candidate_id == models.Candidate.id)
            .join(models.Job, models.Job.id == models.Application.job_id)
            .filter(models.Job.company_id == current_user.company_id)
            .distinct()
            .order_by(models.Candidate.created_at.desc())
            .all()
        )

    # admin: see all
    return db.query(models.Candidate).order_by(models.Candidate.created_at.desc()).all()


@router.get("/{candidate_id}", response_model=schemas.CandidateOut)
def get_candidate(
    candidate_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves candidate details by candidate ID, with ownership/company checks."""
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Candidate users can only see their own records
    if current_user.role == "candidate" and candidate.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # HR/approver can only see candidates with applications to their company
    if current_user.role in ("hr", "approver"):
        has_company_app = (
            db.query(models.Application)
            .join(models.Job, models.Job.id == models.Application.job_id)
            .filter(
                models.Application.candidate_id == candidate_id,
                models.Job.company_id == current_user.company_id,
            )
            .first()
        )
        if not has_company_app:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return candidate


@router.patch("/{candidate_id}", response_model=schemas.CandidateOut)
def update_candidate(
    candidate_id: str,
    candidate_update: schemas.CandidateUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Manually update candidate fields such as parsed_data, name, email.
    Only the owning candidate or HR/admin can update.
    """
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Ownership check
    if current_user.role == "candidate" and candidate.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role not in ("candidate", "hr", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    update_data = candidate_update.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(candidate, field, value)

    db.commit()
    db.refresh(candidate)

    # Phase 2: If parsed_data was populated or updated, embed and upsert into Chroma
    if "parsed_data" in update_data and candidate.parsed_data:
        try:
            from app.services.embeddings import upsert_candidate_vector
            upsert_candidate_vector(candidate.id, candidate.parsed_data)
        except Exception:
            pass

    return candidate


# ---- Applications ----

@router.get("/{candidate_id}/applications", response_model=list[schemas.ApplicationOut])
def list_candidate_applications(
    candidate_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lists all applications for a specific candidate."""
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Candidate can only see their own applications
    if current_user.role == "candidate" and candidate.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    query = db.query(models.Application).filter(models.Application.candidate_id == candidate_id)

    # HR/approver scoped to their company's jobs
    if current_user.role in ("hr", "approver"):
        query = query.join(models.Job).filter(models.Job.company_id == current_user.company_id)

    return query.order_by(models.Application.created_at.desc()).all()


# ---- Submit Application for Approval ----

@router.post(
    "/applications/{application_id}/submit-for-approval",
    response_model=schemas.SubmitForApprovalResponse,
)
def submit_for_approval(
    application_id: str,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Submit an application for human-in-the-loop approval.

    1. Validates application existence and linked job.
    2. Determines job's role_tier and queries configured ApprovalPolicy for step 1.
    3. Verifies no pending approval already exists for this application.
    4. Creates the initial Approval record in 'pending' status.
    5. Transitions application.status to 'pending_approval'.
    """
    application = db.query(models.Application).filter(models.Application.id == application_id).first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    job = db.query(models.Job).filter(models.Job.id == application.job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Linked job not found for application",
        )

    # HR can only submit for their company's jobs
    if current_user.role == "hr" and job.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Check if an approval is already pending
    existing_pending = (
        db.query(models.Approval)
        .filter(models.Approval.application_id == application.id, models.Approval.action == "pending")
        .first()
    )
    if existing_pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Application already has a pending approval task (ID: {existing_pending.id}) assigned to {existing_pending.approver_role}",
        )

    # Look up the first step policy for this job's role_tier
    first_policy = (
        db.query(models.ApprovalPolicy)
        .filter(models.ApprovalPolicy.role_tier == job.role_tier)
        .order_by(models.ApprovalPolicy.step_order.asc())
        .first()
    )
    if not first_policy:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No approval policy configured for role tier '{job.role_tier}'",
        )

    approval = models.Approval(
        application_id=application.id,
        approver_role=first_policy.approver_role,
        step_order=first_policy.step_order,
        action="pending",
    )
    db.add(approval)
    application.status = "pending_approval"
    db.commit()
    db.refresh(application)
    db.refresh(approval)

    return schemas.SubmitForApprovalResponse(
        application_id=application.id,
        status=application.status,
        current_approval=schemas.ApprovalOut.model_validate(approval),
        message=f"Application submitted for approval to {approval.approver_role} (tier: {job.role_tier}, step: {approval.step_order}).",
    )
