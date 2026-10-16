"""
Notifications router for in-app alert feeds and email status verification.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.services.notifications import send_notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/me", response_model=List[schemas.NotificationOut])
def get_my_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Returns recent in-app notifications and email dispatch logs for current user."""
    notifications = (
        db.query(models.Notification)
        .filter(
            or_(
                models.Notification.user_id == current_user.id,
                models.Notification.recipient_email == current_user.email,
            )
        )
        .order_by(models.Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return notifications


@router.get("/unread-count", response_model=schemas.UnreadCountResponse)
def get_unread_notification_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Returns unread notification count for current user for fast navbar polling."""
    count = (
        db.query(models.Notification)
        .filter(
            or_(
                models.Notification.user_id == current_user.id,
                models.Notification.recipient_email == current_user.email,
            ),
            models.Notification.is_read == False,
        )
        .count()
    )
    return schemas.UnreadCountResponse(unread_count=count)


@router.patch("/{notification_id}/read", response_model=schemas.NotificationOut)
def mark_notification_read(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Marks a notification as read."""
    notif = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


@router.post("/mark-all-read")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Marks all notifications for current user as read."""
    db.query(models.Notification).filter(
        or_(
            models.Notification.user_id == current_user.id,
            models.Notification.recipient_email == current_user.email,
        )
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"message": "All notifications marked as read"}


@router.post("/test-email", response_model=schemas.NotificationOut)
def send_test_email(
    payload: schemas.TestEmailRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Triggers a test email notification dispatch (Recruiters / Admins).
    Logs to database and attempts SMTP delivery if configured.
    """
    if current_user.role not in ("hr", "admin", "approver"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters, approvers, or admins can test email dispatch",
        )

    html_content = f"""
    <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #6452ce; margin-top: 0;">ReSumo Notification Test</h2>
      <p>This is a test notification from ReSumo automated recruitment platform.</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Message:</strong> {payload.message}</p>
        <p><strong>Sender:</strong> {current_user.name or current_user.email} ({current_user.role})</p>
      </div>
      <p style="color: #64748b; font-size: 13px;">If you received this email, your SMTP configuration is operational.</p>
    </div>
    """

    return send_notification(
        db=db,
        recipient_email=payload.recipient_email,
        subject=payload.subject,
        body_text=payload.message,
        body_html=html_content,
        notification_type="general",
        user_id=current_user.id,
    )


def seed_demo_notifications_if_empty(db: Session):
    """Seed demo in-app alerts so users can immediately test notifications across all roles."""
    try:
        count = db.query(models.Notification).count()
        if count > 0:
            return

        demo_notifs = [
            # Candidate alerts
            (
                "candidate@resumo.ai",
                "Offer Extended: Senior AI Engineer",
                "Congratulations Alex! An offer of $185,000 has been extended for the Senior AI Engineer role. Please review your terms and sign.",
                "offer_extended",
                False,
            ),
            (
                "candidate@resumo.ai",
                "Interview Confirmed: Technical Architecture",
                "Your interview with David Chen is scheduled. View your calendar in the portal to download your .ics invite.",
                "interview_scheduled",
                False,
            ),
            # HR alerts
            (
                "hr@resumo.ai",
                "New Candidate Application: Alex Rivera",
                "Alex Rivera applied for Senior AI Engineer with a 94% match score and 8 years of distributed systems experience.",
                "application_received",
                False,
            ),
            (
                "hr@resumo.ai",
                "Onboarding Milestone: Background Check Approved",
                "Candidate Alex Rivera completed direct deposit and I-9 compliance forms.",
                "onboarding_update",
                False,
            ),
            # Approver alerts
            (
                "approver@resumo.ai",
                "Approval Required: Offer for Alex Rivera",
                "Offer of $185,000 for Senior AI Engineer requires hiring manager sign-off. Click to inspect rationale and scorecards.",
                "approval_required",
                False,
            ),
            # Admin alerts
            (
                "admin@resumo.ai",
                "System Health: AI Ingestion Services Online",
                "Resume parsing workers, vector indexers, and SMTP dispatch gateways are operating normally.",
                "general",
                False,
            ),
        ]

        for email, subject, body, n_type, is_read in demo_notifs:
            user = db.query(models.User).filter(models.User.email == email).first()
            notif = models.Notification(
                user_id=user.id if user else None,
                recipient_email=email,
                subject=subject,
                body_text=body,
                notification_type=n_type,
                is_read=is_read,
                delivery_status="sent",
            )
            db.add(notif)
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"Warning: Failed to seed demo notifications: {exc}")

