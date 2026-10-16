"""
Transactional Notification & Email Service for ReSumo.

Handles in-app notification logging, HTML email template generation,
and SMTP email dispatch for offers, interview schedules, and onboarding.
"""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from sqlalchemy.orm import Session
from app import models

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "notifications@resumo.ai")
ENABLE_EMAIL_DISPATCH = os.getenv("ENABLE_EMAIL_DISPATCH", "false").lower() in ("true", "1")


def send_notification(
    db: Session,
    recipient_email: str,
    subject: str,
    body_text: str,
    notification_type: str,
    user_id: Optional[str] = None,
    reference_id: Optional[str] = None,
    body_html: Optional[str] = None,
) -> models.Notification:
    """
    Creates and records a notification in the database, and dispatches via SMTP
    if email settings are configured.
    """
    delivery_status = "logged"

    # Attempt SMTP email dispatch if configured
    if ENABLE_EMAIL_DISPATCH and SMTP_HOST and recipient_email:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = SMTP_FROM_EMAIL
            msg["To"] = recipient_email

            part1 = MIMEText(body_text, "plain")
            msg.attach(part1)

            if body_html:
                part2 = MIMEText(body_html, "html")
                msg.attach(part2)

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5) as server:
                server.starttls()
                if SMTP_USER and SMTP_PASSWORD:
                    server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_FROM_EMAIL, [recipient_email], msg.as_string())
            delivery_status = "sent"
            logger.info("Successfully sent SMTP email to %s: %s", recipient_email, subject)
        except Exception as exc:
            logger.warning("SMTP dispatch to %s failed (%s). Notification recorded in database.", recipient_email, exc)
            delivery_status = "logged"
    else:
        logger.info("Notification logged for %s: %s (type=%s)", recipient_email, subject, notification_type)

    notification = models.Notification(
        user_id=user_id,
        recipient_email=recipient_email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        notification_type=notification_type,
        reference_id=reference_id,
        is_read=False,
        delivery_status=delivery_status,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


# Helper Notification Templates

def notify_offer_extended(db: Session, offer: models.Offer, candidate: models.Candidate, recipient_email: str):
    """Sends notification to candidate when an offer letter is extended."""
    subject = f"Official Offer Extended: {offer.role_title or 'Engineering Role'} at ReSumo Partner"
    body_text = (
        f"Congratulations!\n\n"
        f"You have received an official employment offer for the position of {offer.role_title}.\n"
        f"Base Salary: {offer.currency} {offer.salary:,.2f} per annum\n"
        f"Target Start Date: {offer.start_date or 'To be confirmed'}\n\n"
        f"Please log in to your Candidate Portal to review and sign your offer letter."
    )
    body_html = f"""
    <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; borderRadius: 12px;">
      <h2 style="color: #6452ce; margin-top: 0;">Congratulations on Your Offer!</h2>
      <p>We are delighted to extend an offer of employment for <strong>{offer.role_title}</strong>.</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Annual Base Salary:</strong> {offer.currency} {offer.salary:,.2f}</p>
        <p style="margin: 4px 0;"><strong>Target Start Date:</strong> {offer.start_date or 'Immediate'}</p>
        <p style="margin: 4px 0;"><strong>Equity Grant:</strong> {offer.equity or 'None specified'}</p>
      </div>
      <p>Log into your ReSumo portal to view, sign, and accept your offer letter.</p>
    </div>
    """
    return send_notification(
        db=db,
        recipient_email=recipient_email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        notification_type="offer_extended",
        user_id=candidate.user_id,
        reference_id=offer.id,
    )


def notify_offer_responded(db: Session, offer: models.Offer, candidate: models.Candidate, action: str, recruiter_email: str):
    """Sends notification to recruiter/HR when a candidate accepts or declines an offer."""
    status_str = "ACCEPTED" if action == "accept" else "DECLINED"
    subject = f"Offer {status_str}: {candidate.name or candidate.email} for {offer.role_title}"
    body_text = (
        f"Candidate Decision Recorded:\n\n"
        f"Candidate: {candidate.name or 'Candidate'} ({candidate.email})\n"
        f"Position: {offer.role_title}\n"
        f"Decision: {status_str}\n\n"
        f"Pre-boarding tasks and compliance records have been updated in the recruiter dashboard."
    )
    return send_notification(
        db=db,
        recipient_email=recruiter_email,
        subject=subject,
        body_text=body_text,
        notification_type=f"offer_{action}ed",
        reference_id=offer.id,
    )


def notify_interview_scheduled(
    db: Session,
    schedule: models.InterviewSchedule,
    candidate: models.Candidate,
    candidate_email: str,
    interviewer_email: Optional[str] = None,
):
    """Notifies both candidate and interviewer of scheduled interview session."""
    formatted_time = schedule.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")
    subject = f"Interview Confirmed: {schedule.title} ({formatted_time})"
    body_text = (
        f"Hello,\n\n"
        f"Your interview session has been scheduled successfully.\n\n"
        f"Round: {schedule.title}\n"
        f"Date & Time: {formatted_time}\n"
        f"Duration: {schedule.duration_minutes} minutes\n"
        f"Meeting Video Link: {schedule.meeting_link or 'Will be provided prior to call'}\n\n"
        f"You can download the .ics calendar invite directly from your ReSumo dashboard."
    )
    # Notify Candidate
    send_notification(
        db=db,
        recipient_email=candidate_email,
        subject=subject,
        body_text=body_text,
        notification_type="interview_scheduled",
        user_id=candidate.user_id,
        reference_id=schedule.id,
    )
    # Notify Interviewer if email provided
    if interviewer_email:
        send_notification(
            db=db,
            recipient_email=interviewer_email,
            subject=f"[Interviewer Reminder] {subject}",
            body_text=body_text,
            notification_type="interview_scheduled",
            reference_id=schedule.id,
        )


def notify_onboarding_verified(db: Session, task: models.OnboardingTask, candidate: models.Candidate, candidate_email: str):
    """Notifies candidate when an onboarding task is approved/verified by HR."""
    subject = f"Compliance Verified: {task.title}"
    body_text = (
        f"Great news!\n\n"
        f"Your onboarding submission for '{task.title}' has been reviewed and verified by HR.\n"
        f"Your Day-1 readiness progress has been updated in the portal."
    )
    return send_notification(
        db=db,
        recipient_email=candidate_email,
        subject=subject,
        body_text=body_text,
        notification_type="onboarding_verified",
        user_id=candidate.user_id,
        reference_id=task.id,
    )
