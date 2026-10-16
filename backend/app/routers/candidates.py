from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("/", response_model=list[schemas.CandidateOut])
def list_candidates(
    job_id: str | None = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lists candidates scoped by role:
    - Candidate: sees only their own record(s).
    - HR/approver: sees candidates with Applications to their company's jobs (plus unassigned pool fallback).
    - Admin: sees all candidates.
    """
    if current_user.role == "candidate":
        query = db.query(models.Candidate).filter(models.Candidate.user_id == current_user.id)
        if job_id:
            query = query.join(models.Application).filter(models.Application.job_id == job_id)
        return query.order_by(models.Candidate.created_at.desc()).all()

    if current_user.role in ("hr", "approver"):
        if job_id:
            job = db.query(models.Job).filter(models.Job.id == job_id).first()
            if not job or (current_user.company_id and job.company_id != current_user.company_id):
                return []
            return (
                db.query(models.Candidate)
                .join(models.Application, models.Application.candidate_id == models.Candidate.id)
                .filter(models.Application.job_id == job_id)
                .distinct()
                .order_by(models.Candidate.created_at.desc())
                .all()
            )

        # Candidates who have at least one application to this company's jobs
        # Fallback: candidates with no applications assigned yet (unassigned recruitment pool)
        # Note: Proper seeding of company applications should replace this fallback in production.
        from sqlalchemy import select
        has_any_apps = select(models.Application.candidate_id)
        return (
            db.query(models.Candidate)
            .outerjoin(models.Application, models.Application.candidate_id == models.Candidate.id)
            .outerjoin(models.Job, models.Job.id == models.Application.job_id)
            .filter(
                (models.Job.company_id == current_user.company_id)
                | (~models.Candidate.id.in_(has_any_apps))
            )
            .distinct()
            .order_by(models.Candidate.created_at.desc())
            .all()
        )

    # admin: see all
    query = db.query(models.Candidate)
    if job_id:
        query = query.join(models.Application).filter(models.Application.job_id == job_id)
    return query.order_by(models.Candidate.created_at.desc()).all()


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

    # HR/approver can only see candidates with applications to their company OR unassigned pool candidates
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
        has_other_company_app = (
            db.query(models.Application)
            .join(models.Job, models.Job.id == models.Application.job_id)
            .filter(
                models.Application.candidate_id == candidate_id,
                models.Job.company_id != current_user.company_id,
            )
            .first()
        )
        # Deny access if candidate has applications belonging to another company
        if has_other_company_app and not has_company_app:
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

@router.get("/me/applications", response_model=list[schemas.ApplicationOut])
def get_my_applications(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lists applications belonging to the authenticated candidate."""
    if current_user.role != "candidate":
        # For non-candidates, return applications relevant to their company
        return (
            db.query(models.Application)
            .join(models.Job, models.Job.id == models.Application.job_id)
            .filter(models.Job.company_id == current_user.company_id)
            .order_by(models.Application.created_at.desc())
            .all()
        )

    return (
        db.query(models.Application)
        .join(models.Candidate, models.Candidate.id == models.Application.candidate_id)
        .filter(models.Candidate.user_id == current_user.id)
        .order_by(models.Application.created_at.desc())
        .all()
    )


@router.get("/{candidate_id}/applications", response_model=list[schemas.ApplicationOut])
def list_candidate_applications(
    candidate_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lists all applications for a specific candidate."""
    if candidate_id == "me":
        return get_my_applications(current_user, db)

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


@router.patch("/applications/{application_id}/status", response_model=schemas.ApplicationOut)
def update_application_status(
    application_id: str,
    payload: schemas.ApplicationStatusUpdate,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Manually transitions application status for recruiter Kanban and stage management.
    Supports moving candidate to 'shortlisted', 'rejected', 'parsed', etc.
    If transitioned to 'pending_approval', invokes the approval policy escalation chain.
    """
    application = db.query(models.Application).filter(models.Application.id == application_id).first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    job = db.query(models.Job).filter(models.Job.id == application.job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Linked job not found")

    if current_user.role == "hr" and current_user.company_id and job.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to other company requisitions")

    # If transitioning to pending_approval, delegate to submit_for_approval logic
    if payload.status == "pending_approval":
        submit_res = submit_for_approval(application_id, current_user, db)
        db.refresh(application)
        return application

    application.status = payload.status
    db.commit()
    db.refresh(application)
    return application


@router.post("/{candidate_id}/assign-job", response_model=schemas.ApplicationOut, status_code=status.HTTP_201_CREATED)
def assign_candidate_to_job(
    candidate_id: str,
    payload: schemas.CandidateAssignJobRequest,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Assigns an unassigned candidate in the talent pool to a job requisition.
    Directly creates an Application with the designated initial status (default 'shortlisted').
    """
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    job = db.query(models.Job).filter(models.Job.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job requisition not found")

    if current_user.role == "hr" and current_user.company_id and job.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to assign to other company jobs")

    # Check existing application
    existing = (
        db.query(models.Application)
        .filter(models.Application.candidate_id == candidate.id, models.Application.job_id == job.id)
        .first()
    )
    if existing:
        existing.status = payload.initial_status
        db.commit()
        db.refresh(existing)
        return existing

    # Compute similarity and rationale
    sim = 0.75
    rationale = f"Candidate assigned directly to requisition {job.title} by recruitment team."
    rationale_source = "mock"

    try:
        from app.services.embeddings import build_job_embedding_text, compute_embedding
        import numpy as np

        cand_text = candidate.raw_text or ""
        if candidate.parsed_data:
            from app.services.embeddings import serialize_candidate_for_embedding
            cand_text = serialize_candidate_for_embedding(candidate.parsed_data)
        if cand_text:
            j_vec = np.array(compute_embedding(build_job_embedding_text(job.title, job.description, job.role_tier)))
            c_vec = np.array(compute_embedding(cand_text))
            norm_j = np.linalg.norm(j_vec)
            norm_c = np.linalg.norm(c_vec)
            if norm_j > 0 and norm_c > 0:
                sim = float(np.dot(j_vec, c_vec) / (norm_j * norm_c))
    except Exception:
        pass

    if candidate.parsed_data:
        try:
            from app.services.llm import get_llm_provider
            llm = get_llm_provider()
            rationale = llm.generate_match_rationale(
                job_title=job.title,
                job_description=job.description,
                job_role_tier=job.role_tier,
                candidate_data=candidate.parsed_data,
                similarity_score=sim,
            )
            rationale_source = getattr(llm, "provider_name", "mock")
        except Exception:
            pass

    application = models.Application(
        candidate_id=candidate.id,
        job_id=job.id,
        status=payload.initial_status,
        similarity_score=round(sim, 4),
        rationale=rationale,
        rationale_source=rationale_source,
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


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


@router.post(
    "/{candidate_id}/submit-for-approval",
    response_model=schemas.SubmitForApprovalResponse,
)
def submit_candidate_for_approval(
    candidate_id: str,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """Convenience alias: submits the candidate's latest active application for approval."""
    application = (
        db.query(models.Application)
        .filter(models.Application.candidate_id == candidate_id)
        .order_by(models.Application.created_at.desc())
        .first()
    )
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No application found for candidate '{candidate_id}'",
        )
    return submit_for_approval(application.id, current_user, db)

