"""
Phase 3 HITL (Human-In-The-Loop) Tiered Approval Workflow Router.

Provides:
- GET /approvals/pending: lists pending approvals scoped to the approver's company and role.
- POST /approvals/{approval_id}/action: approve/reject with notes, advancing chain or setting terminal application status.
- GET /approvals/policies: lists configurable approval routing policies (demoable for viva).
- POST /approvals/policies: creates custom routing steps.
- DELETE /approvals/policies/{policy_id}: removes a routing policy step.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/approvals", tags=["approvals"])

DEFAULT_POLICIES = [
    {"role_tier": "junior", "step_order": 1, "approver_role": "hiring_manager"},
    {"role_tier": "mid", "step_order": 1, "approver_role": "hiring_manager"},
    {"role_tier": "senior", "step_order": 1, "approver_role": "director"},
    {"role_tier": "senior", "step_order": 2, "approver_role": "vp"},
    {"role_tier": "exec", "step_order": 1, "approver_role": "ceo"},
]


def seed_default_policies_if_empty(db: Session) -> None:
    """Seeds the standard 5 approval routing policies if the table is currently empty."""
    count = db.query(models.ApprovalPolicy).count()
    if count == 0:
        for p in DEFAULT_POLICIES:
            db.add(
                models.ApprovalPolicy(
                    role_tier=p["role_tier"],
                    step_order=p["step_order"],
                    approver_role=p["approver_role"],
                )
            )
        db.commit()


@router.get("/pending", response_model=list[schemas.ApprovalOut])
def list_pending_approvals(
    current_user: models.User = Depends(require_role("approver", "admin")),
    db: Session = Depends(get_db),
):
    """
    Lists pending approval tasks. Role and company come from the authenticated user:
    - Approvers see only pending approvals matching their approver_role, scoped to their company's jobs.
    - Admins see all pending approvals.
    """
    query = db.query(models.Approval).filter(models.Approval.action == "pending")

    if current_user.role == "approver":
        # Filter by approver's role
        if current_user.approver_role:
            query = query.filter(models.Approval.approver_role == current_user.approver_role)

        # Scope to approver's company
        if current_user.company_id:
            query = (
                query
                .join(models.Application, models.Application.id == models.Approval.application_id)
                .join(models.Job, models.Job.id == models.Application.job_id)
                .filter(models.Job.company_id == current_user.company_id)
            )

    return query.order_by(models.Approval.created_at.asc()).all()


@router.get("/application/{application_id}", response_model=list[schemas.ApprovalOut])
def get_application_approvals(
    application_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves all historical and active approval records for a specific application."""
    return (
        db.query(models.Approval)
        .filter(models.Approval.application_id == application_id)
        .order_by(models.Approval.step_order.asc(), models.Approval.created_at.asc())
        .all()
    )


@router.post("/{approval_id}/action", response_model=schemas.ApprovalOut)
def action_approval(
    approval_id: str,
    action_req: schemas.ApprovalActionRequest,
    current_user: models.User = Depends(require_role("approver", "admin")),
    db: Session = Depends(get_db),
):
    """
    Action an approval record (approve or reject) with optional notes.
    Records acted_by_user_id from the authenticated user.

    - On reject:
        Halts the approval chain immediately and transitions application.status to 'rejected'.
    - On approve:
        Queries the approval policy chain for the application's job role_tier.
        If a subsequent tier exists:
            Creates the next step's Approval record in 'pending' status.
            Application remains in 'pending_approval'.
        If this was the final step:
            Transitions application.status to 'approved'.
    """
    approval = db.query(models.Approval).filter(models.Approval.id == approval_id).first()
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Approval record '{approval_id}' not found",
        )

    if approval.action != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Approval record '{approval_id}' has already been acted upon (action: {approval.action})",
        )

    application = db.query(models.Application).filter(models.Application.id == approval.application_id).first()
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{approval.application_id}' associated with approval not found",
        )

    now = datetime.now(timezone.utc)
    acted_action = "approved" if action_req.action == "approve" else "rejected"
    approval.action = acted_action
    approval.notes = action_req.notes
    approval.acted_at = now
    approval.acted_by_user_id = current_user.id

    if action_req.action == "reject":
        application.status = "rejected"
        db.commit()
        db.refresh(approval)
        return approval

    # For action == "approve", check if there's a subsequent approval tier
    job = db.query(models.Job).filter(models.Job.id == application.job_id).first()
    role_tier = job.role_tier if job else "junior"

    next_policy = (
        db.query(models.ApprovalPolicy)
        .filter(
            models.ApprovalPolicy.role_tier == role_tier,
            models.ApprovalPolicy.step_order > approval.step_order,
        )
        .order_by(models.ApprovalPolicy.step_order.asc())
        .first()
    )

    if next_policy:
        # Create next approval in the escalation chain
        next_approval = models.Approval(
            application_id=application.id,
            approver_role=next_policy.approver_role,
            step_order=next_policy.step_order,
            action="pending",
        )
        db.add(next_approval)
        application.status = "pending_approval"
    else:
        # Terminal approval reached for this chain
        application.status = "approved"

    db.commit()
    db.refresh(approval)
    return approval


# ---- Policy Management (Data-Driven Configuration for Viva Demonstration) ----

@router.get("/policies", response_model=list[schemas.ApprovalPolicyOut])
def list_approval_policies(
    role_tier: Optional[str] = Query(None, description="Filter by role tier (junior, mid, senior, exec)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lists configured approval policies ordered by role tier and step sequence."""
    query = db.query(models.ApprovalPolicy)
    if role_tier:
        query = query.filter(models.ApprovalPolicy.role_tier == role_tier)
    return query.order_by(models.ApprovalPolicy.role_tier, models.ApprovalPolicy.step_order.asc()).all()


@router.post("/policies", response_model=schemas.ApprovalPolicyOut, status_code=status.HTTP_201_CREATED)
def create_approval_policy(
    policy_in: schemas.ApprovalPolicyCreate,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Creates a new approval policy step for a role tier. Admin only."""
    existing = (
        db.query(models.ApprovalPolicy)
        .filter(
            models.ApprovalPolicy.role_tier == policy_in.role_tier,
            models.ApprovalPolicy.step_order == policy_in.step_order,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Policy step {policy_in.step_order} for role tier '{policy_in.role_tier}' already exists with approver '{existing.approver_role}'.",
        )

    policy = models.ApprovalPolicy(
        role_tier=policy_in.role_tier,
        step_order=policy_in.step_order,
        approver_role=policy_in.approver_role,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_approval_policy(
    policy_id: str,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Deletes an approval policy step. Admin only."""
    policy = db.query(models.ApprovalPolicy).filter(models.ApprovalPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval policy not found")
    db.delete(policy)
    db.commit()
    return None
