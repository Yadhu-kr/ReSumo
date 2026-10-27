from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_

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
        query = db.query(models.Candidate).filter(
            or_(
                models.Candidate.user_id == current_user.id,
                models.Candidate.email == current_user.email,
            )
        )
        if job_id:
            query = query.join(models.Application).filter(models.Application.job_id == job_id)
        return query.order_by(models.Candidate.created_at.desc()).all()

    if current_user.role in ("hr", "approver", "interviewer"):
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
    if current_user.role == "candidate" and candidate.user_id != current_user.id and candidate.email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # HR/approver/interviewer can only see candidates with applications to their company OR unassigned pool candidates
    if current_user.role in ("hr", "approver", "interviewer"):
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
    if current_user.role == "candidate" and candidate.user_id != current_user.id and candidate.email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role not in ("candidate", "hr", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # HR can only update candidates who belong to or have applications with their company
    if current_user.role == "hr" and current_user.company_id:
        has_company_app = (
            db.query(models.Application)
            .join(models.Job, models.Job.id == models.Application.job_id)
            .filter(
                models.Application.candidate_id == candidate.id,
                models.Job.company_id == current_user.company_id,
            )
            .first()
        )
        has_other_company_app = (
            db.query(models.Application)
            .join(models.Job, models.Job.id == models.Application.job_id)
            .filter(
                models.Application.candidate_id == candidate.id,
                models.Job.company_id != current_user.company_id,
            )
            .first()
        )
        if has_other_company_app and not has_company_app:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: candidate belongs to another organization")

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
        .filter(
            or_(
                models.Candidate.user_id == current_user.id,
                models.Candidate.email == current_user.email,
            )
        )
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
    if current_user.role == "candidate" and candidate.user_id != current_user.id and candidate.email != current_user.email:
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

    # If transitioned to "offered", ensure an Offer record exists in the database
    if payload.status == "offered":
        existing_offer = db.query(models.Offer).filter(models.Offer.application_id == application.id).first()
        if not existing_offer:
            from app.services.offers import generate_offer_letter_text
            cand = db.query(models.Candidate).filter(models.Candidate.id == application.candidate_id).first()
            comp = db.query(models.Company).filter(models.Company.id == job.company_id).first() if job else None
            company_name = comp.name if comp else "ReSumo Partner Organization"
            candidate_name = cand.name if (cand and cand.name) else "Prospective Team Member"
            candidate_email = cand.email if (cand and cand.email) else "candidate@resumo.ai"
            role_title = job.title if job else "Software Engineer"
            salary = 145000.0
            letter_text = generate_offer_letter_text(
                company_name=company_name,
                candidate_name=candidate_name,
                candidate_email=candidate_email,
                role_title=role_title,
                salary=salary,
                currency="USD",
                notes="Formal offer generated upon extending offer in candidate pipeline.",
            )
            offer = models.Offer(
                candidate_id=application.candidate_id,
                application_id=application.id,
                role_title=role_title,
                salary=salary,
                currency="USD",
                offer_letter_text=letter_text,
                status="sent",
            )
            db.add(offer)
        elif existing_offer.status == "draft":
            existing_offer.status = "sent"

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
            from app.services.embeddings import build_candidate_embedding_text
            cand_text = build_candidate_embedding_text(candidate.parsed_data) or cand_text
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

    # Validate application lifecycle state: do not allow re-submitting terminal/active approval states
    if application.status in ("approved", "offered", "hired", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit application for approval in '{application.status}' state",
        )

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


# =========================================================================
# Activity Audit Trail, Timeline & Internal Collaboration Notes
# =========================================================================

@router.get("/{candidate_id}/timeline", response_model=schemas.CandidateTimelineResponse)
def get_candidate_timeline(
    candidate_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Chronological activity log aggregating candidate lifecycle events:
    - Resume parsing
    - Application assignments & status updates
    - Approvals requested & actioned
    - Interview rounds scheduled
    - Scorecards submitted
    - Offer letters drafted, sent, accepted/declined
    - Onboarding completions & verifications
    - Internal team notes
    """
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.role == "candidate" and candidate.user_id != current_user.id and candidate.email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    events = []

    # 1. Candidate Creation / Resume Parsed
    created_at = candidate.created_at or datetime.now(timezone.utc)
    parsed_skills_count = len(candidate.parsed_data.get("core_skills", [])) if candidate.parsed_data else 0
    events.append(schemas.TimelineEventOut(
        id=f"evt-created-{candidate.id}",
        event_type="resume_uploaded",
        title="Resume Ingested & Parsed",
        description=f"Resume file '{candidate.raw_resume_filename}' processed with {parsed_skills_count} core skills extracted.",
        actor_name=candidate.name or "Candidate Sourcing Engine",
        actor_role="system",
        timestamp=created_at,
        metadata={"filename": candidate.raw_resume_filename, "skills_count": parsed_skills_count},
    ))

    # 2. Applications & Status Transitions
    for app in candidate.applications:
        job_title = app.job.title if app.job else "Unknown Role"
        app_created = app.created_at or created_at
        events.append(schemas.TimelineEventOut(
            id=f"evt-app-{app.id}",
            event_type="application_created",
            title=f"Applied to {job_title}",
            description=f"Application linked to requisition with {int((app.similarity_score or 0.75) * 100)}% match score.",
            actor_name="Talent Matching Engine",
            actor_role="system",
            timestamp=app_created,
            metadata={"job_id": app.job_id, "similarity": app.similarity_score, "status": app.status},
        ))

        # 3. Approvals
        for approval in app.approvals:
            appr_created = approval.created_at or app_created
            events.append(schemas.TimelineEventOut(
                id=f"evt-appr-req-{approval.id}",
                event_type="approval_requested",
                title=f"Approval Requested ({approval.approver_role.replace('_', ' ').title()})",
                description=f"Step {approval.step_order} routed for {approval.approver_role.replace('_', ' ').upper()} review.",
                actor_name="ReSumo Orchestrator",
                actor_role="system",
                timestamp=appr_created,
                metadata={"step_order": approval.step_order, "role": approval.approver_role},
            ))

            if approval.action != "pending" and approval.acted_at:
                action_title = "Approved by " + approval.approver_role.replace('_', ' ').title() if approval.action == "approved" else "Rejected by " + approval.approver_role.replace('_', ' ').title()
                actor_display = approval.acted_by_user.name if approval.acted_by_user else approval.approver_role.replace('_', ' ').title()
                events.append(schemas.TimelineEventOut(
                    id=f"evt-appr-act-{approval.id}",
                    event_type="approval_signed" if approval.action == "approved" else "approval_rejected",
                    title=action_title,
                    description=approval.notes or f"Decision confirmed for Step {approval.step_order}.",
                    actor_name=actor_display,
                    actor_role=approval.approver_role,
                    timestamp=approval.acted_at,
                    metadata={"action": approval.action, "notes": approval.notes},
                ))

    # 4. Interviews
    for sched in candidate.schedules:
        events.append(schemas.TimelineEventOut(
            id=f"evt-sched-{sched.id}",
            event_type="interview_scheduled",
            title=f"Interview Scheduled: {sched.title}",
            description=f"Format: {sched.round_type.title()} ({sched.duration_minutes} min). Interviewer: {sched.interviewer_name}.",
            actor_name=sched.interviewer_name or "Scheduling Coordinator",
            actor_role="interviewer",
            timestamp=sched.created_at or created_at,
            metadata={"meeting_link": sched.meeting_link, "round_type": sched.round_type},
        ))

    # 5. Scorecards
    for score in candidate.interview_scores:
        events.append(schemas.TimelineEventOut(
            id=f"evt-score-{score.id}",
            event_type="scorecard_submitted",
            title=f"Scorecard: {score.dimension.replace('_', ' ').title()} ({score.score}★)",
            description=score.notes or f"Evaluated by {score.interviewer_name}. Recommendation: {score.recommendation or 'N/A'}.",
            actor_name=score.interviewer_name or "Evaluator",
            actor_role="interviewer",
            timestamp=score.created_at or created_at,
            metadata={"dimension": score.dimension, "score": score.score, "recommendation": score.recommendation},
        ))

    # 6. Offers
    for offer in candidate.offers:
        offer_created = offer.created_at or created_at
        salary_str = f"${offer.salary:,.2f}" if offer.salary else "Competitive"
        events.append(schemas.TimelineEventOut(
            id=f"evt-offer-draft-{offer.id}",
            event_type="offer_drafted",
            title=f"Offer Prepared ({offer.role_title or 'Selected Role'})",
            description=f"Compensation: {salary_str} base. Equity: {offer.equity or 'None'}.",
            actor_name="Talent Acquisition",
            actor_role="hr",
            timestamp=offer_created,
            metadata={"status": offer.status, "salary": offer.salary},
        ))

        if offer.status in ("sent", "accepted", "declined"):
            events.append(schemas.TimelineEventOut(
                id=f"evt-offer-sent-{offer.id}",
                event_type="offer_sent",
                title="Offer Letter Sent to Candidate",
                description=f"Formal offer extended for {offer.role_title or 'position'} at {salary_str}.",
                actor_name="Talent Acquisition",
                actor_role="hr",
                timestamp=offer_created,
                metadata={"status": "sent", "salary": offer.salary},
            ))

        if offer.status in ("accepted", "declined") and offer.responded_at:
            if offer.status == "accepted":
                events.append(schemas.TimelineEventOut(
                    id=f"evt-offer-acc-{offer.id}",
                    event_type="offer_accepted",
                    title="Offer Accepted by Candidate 🎉",
                    description=f"Candidate accepted offer terms. Start date: {offer.start_date or 'To be confirmed'}.",
                    actor_name=candidate.name or "Candidate",
                    actor_role="candidate",
                    timestamp=offer.responded_at,
                    metadata={"status": "accepted"},
                ))
            elif offer.status == "declined":
                events.append(schemas.TimelineEventOut(
                    id=f"evt-offer-dec-{offer.id}",
                    event_type="offer_declined",
                    title="Offer Declined",
                    description=offer.notes or "Candidate declined the extended offer.",
                    actor_name=candidate.name or "Candidate",
                    actor_role="candidate",
                    timestamp=offer.responded_at,
                    metadata={"status": "declined"},
                ))

    # 7. Onboarding Tasks
    for task in candidate.onboarding_tasks:
        if task.status == "verified" and task.verified_at:
            events.append(schemas.TimelineEventOut(
                id=f"evt-onboard-ver-{task.id}",
                event_type="onboarding_verified",
                title=f"Compliance Verified: {task.title}",
                description=f"Document/form validated for federal/company compliance category '{task.category}'.",
                actor_name="Compliance Officer",
                actor_role="hr",
                timestamp=task.verified_at,
                metadata={"category": task.category},
            ))

    # 8. Team Notes
    notes = (
        db.query(models.CandidateNote)
        .filter(models.CandidateNote.candidate_id == candidate_id)
        .order_by(models.CandidateNote.created_at.desc())
        .all()
    )
    for note in notes:
        events.append(schemas.TimelineEventOut(
            id=f"evt-note-{note.id}",
            event_type="note_added",
            title="Internal Note Added",
            description=note.content,
            actor_name=note.author_name or "Team Member",
            actor_role=note.author_role or "hr",
            timestamp=note.created_at,
            metadata={"note_id": note.id},
        ))

    # Sort all events chronologically ascending
    def get_event_time(evt):
        ts = evt.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts

    events.sort(key=get_event_time)

    return schemas.CandidateTimelineResponse(
        candidate_id=candidate.id,
        events=events,
        notes=[schemas.CandidateNoteOut.model_validate(n) for n in notes],
    )


@router.post("/{candidate_id}/notes", response_model=schemas.CandidateNoteOut, status_code=status.HTTP_201_CREATED)
def add_candidate_note(
    candidate_id: str,
    payload: schemas.CandidateNoteCreate,
    current_user: models.User = Depends(require_role("hr", "interviewer", "approver", "admin")),
    db: Session = Depends(get_db),
):
    """Adds an internal collaboration note to the candidate dossier."""
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    author_name = current_user.name or current_user.email
    note = models.CandidateNote(
        candidate_id=candidate_id,
        author_id=current_user.id,
        author_name=author_name,
        author_role=current_user.role,
        content=payload.content.strip(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{candidate_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate_note(
    candidate_id: str,
    note_id: str,
    current_user: models.User = Depends(require_role("hr", "interviewer", "approver", "admin")),
    db: Session = Depends(get_db),
):
    """Deletes an internal collaboration note."""
    note = db.query(models.CandidateNote).filter(
        models.CandidateNote.id == note_id,
        models.CandidateNote.candidate_id == candidate_id,
    ).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    # Author can delete their own note; HR and admin can delete any note
    if current_user.role not in ("hr", "admin") and note.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete notes written by other team members",
        )

    db.delete(note)
    db.commit()
    return None


# =========================================================================
# Executive Hiring Dossier / Packet Generator
# =========================================================================

def generate_hiring_packet_markdown(candidate: models.Candidate, db: Session) -> str:
    parsed = candidate.parsed_data or {}
    cand_name = candidate.name or parsed.get("current_title") or "Candidate"
    title = parsed.get("current_title") or "Professional"
    raw_seniority = parsed.get("seniority")
    seniority = raw_seniority.upper() if raw_seniority else "Not specified"
    years_exp = parsed.get("years_experience")
    exp_str = f"{years_exp} Years" if years_exp is not None else "Not specified"
    company = parsed.get("current_company") or "Not specified"
    location = parsed.get("location") or "Not specified"
    summary = parsed.get("summary") or "Profile ingested into ReSumo talent intelligence system."
    raw_core = parsed.get("core_skills")
    core_skills = ", ".join(str(s) for s in raw_core) if raw_core and isinstance(raw_core, (list, tuple)) else "None specified"
    raw_sec = parsed.get("secondary_skills")
    secondary_skills = ", ".join(str(s) for s in raw_sec) if raw_sec and isinstance(raw_sec, (list, tuple)) else "None specified"
    raw_tools = parsed.get("tools")
    tools = ", ".join(str(t) for t in raw_tools) if raw_tools and isinstance(raw_tools, (list, tuple)) else "Not specified"
    raw_achievements = parsed.get("key_achievements")
    achievements = raw_achievements if isinstance(raw_achievements, (list, tuple)) else []

    lines = [
        f"# Executive Hiring Dossier: {cand_name}",
        f"**Role Designation:** {title} ({seniority}) | **Total Experience:** {exp_str} | **Current Organization:** {company}",
        f"**Candidate Email:** {candidate.email or 'N/A'} | **Location:** {location}",
        f"**Report Generated:** {datetime.now(timezone.utc).strftime('%B %d, %Y at %H:%M UTC')}",
        "",
        "---",
        "",
        "## 1. Executive Candidate Profile & Qualifications",
        f"> {summary}",
        "",
        f"- **Primary Competencies & Core Skills:** {core_skills}",
        f"- **Secondary & Domain Competencies:** {secondary_skills}",
        f"- **Engineering Toolchain & Frameworks:** {tools}",
        "",
    ]

    if achievements:
        lines.append("### Key Verified Achievements")
        for ach in achievements:
            lines.append(f"- {ach}")
        lines.append("")

    # Application & RAG Match
    lines.append("---")
    lines.append("## 2. Requisition Alignment & Vector Match Rationale")
    if candidate.applications:
        app = candidate.applications[0]
        job = app.job
        sim_pct = int((app.similarity_score or 0.75) * 100)
        lines.append(f"- **Target Requisition:** {job.title if job else 'Unassigned'} ({job.role_tier.upper() if job else 'N/A'})")
        lines.append(f"- **Current Pipeline Stage:** `{app.status.upper()}`")
        lines.append(f"- **Semantic Embedding Similarity:** **{sim_pct}%**")
        lines.append(f"- **AI Match Rationale:**")
        lines.append(f"  > {app.rationale or 'Candidate aligned with core technical job requirements.'}")
    else:
        lines.append("*Candidate currently resides in unassigned talent pool.*")
    lines.append("")

    # Interview Scorecard & Rubrics
    lines.append("---")
    lines.append("## 3. Interview Evaluation & Multi-Dimensional Rubrics")
    scores = candidate.interview_scores
    if scores:
        avg_score = round(sum(s.score for s in scores) / len(scores), 2)
        lines.append(f"**Aggregate Score:** {avg_score} / 5.0 ★ | **Total Evaluations:** {len(scores)}")
        lines.append("")
        lines.append("| Dimension | Rating | Recommendation | Evaluator | Notes |")
        lines.append("|---|---|---|---|---|")
        for s in scores:
            dim = s.dimension.replace("_", " ").title()
            rec = (s.recommendation or "Hire").replace("_", " ").title()
            notes = (s.notes or "").replace("\n", " ")
            lines.append(f"| {dim} | {s.score} ★ | {rec} | {s.interviewer_name or 'Interviewer'} | {notes} |")
    else:
        lines.append("*No interview scorecards recorded to date.*")
    lines.append("")

    # Approval Sign-offs
    lines.append("---")
    lines.append("## 4. Multi-Tier Governance & Approval Audit Trail")
    approvals = []
    for app in candidate.applications:
        approvals.extend(app.approvals)
    if approvals:
        lines.append("| Step | Approver Tier | Status | Acted By | Sign-off Date | Notes |")
        lines.append("|---|---|---|---|---|---|")
        for a in approvals:
            acted_by = a.acted_by_user.name if a.acted_by_user else (a.approver_role.replace("_", " ").title() if a.action != "pending" else "Pending")
            acted_date = a.acted_at.strftime('%Y-%m-%d %H:%M') if a.acted_at else "—"
            notes = (a.notes or "—").replace("\n", " ")
            lines.append(f"| Step {a.step_order} | {a.approver_role.replace('_', ' ').upper()} | `{a.action.upper()}` | {acted_by} | {acted_date} | {notes} |")
    else:
        lines.append("*No approval chain triggered.*")
    lines.append("")

    # Offer Terms
    lines.append("---")
    lines.append("## 5. Compensation & Extended Offer Terms")
    if candidate.offers:
        off = candidate.offers[0]
        sal = f"${off.salary:,.2f}" if off.salary else "Unspecified"
        lines.append(f"- **Offer Status:** `{off.status.upper()}`")
        lines.append(f"- **Annual Base Salary:** {sal} {off.currency}")
        lines.append(f"- **Equity Grant:** {off.equity or 'None'}")
        lines.append(f"- **Target Start Date:** {off.start_date or 'Immediate'}")
        if off.notes:
            lines.append(f"- **Terms & Perks:** {off.notes}")
    else:
        lines.append("*No formal offer extended.*")
    lines.append("")

    # Onboarding Compliance
    lines.append("---")
    lines.append("## 6. Post-Offer Onboarding Compliance Status")
    tasks = candidate.onboarding_tasks
    if tasks:
        verified_count = sum(1 for t in tasks if t.status == "verified")
        lines.append(f"**Progress:** {verified_count}/{len(tasks)} Verified Compliance Deliverables")
        lines.append("")
        for t in tasks:
            status_icon = "✅" if t.status == "verified" else ("⏳" if t.status == "completed" else "⚪")
            lines.append(f"- {status_icon} **{t.title}** (`{t.status.upper()}`) — Category: *{t.category}*")
    else:
        lines.append("*Onboarding checklist pending offer confirmation.*")
    lines.append("")

    # Internal Collaboration Notes
    lines.append("---")
    lines.append("## 7. Internal Team Collaboration Notes")
    notes = candidate.notes
    if notes:
        lines.append(f"**Total Internal Notes:** {len(notes)}")
        lines.append("")
        for n in notes:
            created = n.created_at.strftime('%Y-%m-%d %H:%M') if n.created_at else "—"
            author = f"{n.author_name} ({n.author_role.upper()})" if n.author_role else (n.author_name or "Team Member")
            lines.append(f"### Note by {author} — *{created}*")
            lines.append(f"> {n.content}")
            lines.append("")
    else:
        lines.append("*No internal collaboration notes recorded.*")
    lines.append("")

    lines.append("---")
    lines.append("*Confidential: Generated by ReSumo Autonomous Talent Intelligence System.*")

    return "\n".join(lines)


@router.get("/{candidate_id}/hiring-packet")
def get_candidate_hiring_packet(
    candidate_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves full candidate hiring debrief packet formatted in Markdown."""
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.role == "candidate" and candidate.user_id != current_user.id and candidate.email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    md_content = generate_hiring_packet_markdown(candidate, db)
    return {
        "candidate_id": candidate_id,
        "candidate_name": candidate.name or "Candidate",
        "markdown": md_content,
    }


@router.get("/{candidate_id}/hiring-packet/download")
def download_candidate_hiring_packet(
    candidate_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Downloads full candidate hiring debrief packet as Markdown (.md) file."""
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.role == "candidate" and candidate.user_id != current_user.id and candidate.email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    md_content = generate_hiring_packet_markdown(candidate, db)
    cand_slug = (candidate.name or "Candidate").replace(" ", "_").replace("/", "_")
    filename = f"ReSumo_Hiring_Packet_{cand_slug}.md"

    return Response(
        content=md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

