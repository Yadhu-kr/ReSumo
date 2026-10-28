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
    Automatically cross-resolves user_id and recipient_email for maximum deliverability.
    """
    delivery_status = "logged"

    # Cross-resolve user_id and recipient_email if either is missing
    if not user_id and recipient_email:
        user = db.query(models.User).filter(models.User.email == recipient_email).first()
        if user:
            user_id = user.id
    elif not recipient_email and user_id:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user:
            recipient_email = user.email

    if not recipient_email:
        recipient_email = "notifications@resumo.ai"

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
    cand_user_id = candidate.user_id
    if not cand_user_id and recipient_email:
        u = db.query(models.User).filter(models.User.email == recipient_email).first()
        if u:
            cand_user_id = u.id
            candidate.user_id = u.id
            db.commit()

    cand_email = recipient_email or candidate.email or (candidate.user.email if candidate.user else None) or "candidate@resumo.ai"
    subject = f"Official Offer Extended: {offer.role_title or 'Engineering Role'} at ReSumo Partner"
    body_text = (
        f"Congratulations!\n\n"
        f"You have received an official employment offer for the position of {offer.role_title}.\n"
        f"Base Salary: {offer.currency} {offer.salary:,.2f} per annum\n"
        f"Target Start Date: {offer.start_date or 'To be confirmed'}\n\n"
        f"Please log in to your Candidate Portal to review and sign your offer letter."
    )
    body_html = f"""
    <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
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
        recipient_email=cand_email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        notification_type="offer_extended",
        user_id=cand_user_id,
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
    cand_user_id = candidate.user_id
    if not cand_user_id and candidate_email:
        u = db.query(models.User).filter(models.User.email == candidate_email).first()
        if u:
            cand_user_id = u.id
            candidate.user_id = u.id
            db.commit()

    cand_email = candidate_email or candidate.email or "candidate@resumo.ai"
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
        recipient_email=cand_email,
        subject=subject,
        body_text=body_text,
        notification_type="interview_scheduled",
        user_id=cand_user_id,
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
    cand_user_id = candidate.user_id
    if not cand_user_id and candidate_email:
        u = db.query(models.User).filter(models.User.email == candidate_email).first()
        if u:
            cand_user_id = u.id
            candidate.user_id = u.id
            db.commit()

    subject = f"Compliance Verified: {task.title}"
    body_text = (
        f"Great news!\n\n"
        f"Your onboarding submission for '{task.title}' has been reviewed and verified by HR.\n"
        f"Your Day-1 readiness progress has been updated in the portal."
    )
    return send_notification(
        db=db,
        recipient_email=candidate_email or candidate.email or "candidate@resumo.ai",
        subject=subject,
        body_text=body_text,
        notification_type="onboarding_verified",
        user_id=cand_user_id,
        reference_id=task.id,
    )


def notify_approval_requested(
    db: Session,
    approval: models.Approval,
    application: models.Application,
    candidate: models.Candidate,
    job: models.Job,
):
    """Dispatches notification to designated approver(s) when an application enters their tier."""
    query = db.query(models.User).filter(
        models.User.role == "approver",
        models.User.approver_role == approval.approver_role,
    )
    if job.company_id:
        company_approvers = query.filter(models.User.company_id == job.company_id).all()
    else:
        company_approvers = []

    approvers = company_approvers or query.all()
    if not approvers:
        approvers = db.query(models.User).filter(models.User.role.in_(["approver", "admin"])).all()

    role_label = approval.approver_role.replace("_", " ").title()
    subject = f"Approval Required: {candidate.name or 'Candidate'} for {job.title} ({role_label})"
    body_text = (
        f"Action Required in Governance Portal:\n\n"
        f"Candidate: {candidate.name or candidate.email}\n"
        f"Requisition: {job.title} (Tier: {job.role_tier})\n"
        f"Stage: {role_label} Sign-off (Step {approval.step_order})\n\n"
        f"Please inspect the candidate's evaluative scorecards and make a sign-off decision in the Approvals portal."
    )
    body_html = f"""
    <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #6452ce; margin-top: 0;">Candidate Approval Required</h2>
      <p>Candidate <strong>{candidate.name or candidate.email}</strong> is ready for <strong>{role_label}</strong> sign-off (Step {approval.step_order}).</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Position:</strong> {job.title}</p>
        <p style="margin: 4px 0;"><strong>Role Tier:</strong> {job.role_tier.upper()}</p>
        <p style="margin: 4px 0;"><strong>Approval Tier:</strong> {role_label}</p>
      </div>
      <p>Please log into ReSumo Governance to inspect the evaluative consensus and approve or reject.</p>
    </div>
    """

    for approver in approvers:
        send_notification(
            db=db,
            recipient_email=approver.email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            notification_type="approval_required",
            user_id=approver.id,
            reference_id=approval.id,
        )


def notify_approval_decision(
    db: Session,
    approval: models.Approval,
    application: models.Application,
    candidate: models.Candidate,
    job: models.Job,
    action: str,  # "approve" or "reject"
    actor_user: models.User,
    next_approval: Optional[models.Approval] = None,
):
    """
    Dispatches notifications following an approval decision:
    - If approved and next tier exists: notify next tier approver + notify HR of escalation.
    - If approved and terminal: notify candidate of approval + notify HR to extend offer.
    - If rejected: notify candidate and notify HR.
    """
    role_label = approval.approver_role.replace("_", " ").title()

    hr_users = db.query(models.User).filter(
        models.User.role == "hr",
        (models.User.company_id == job.company_id) if job.company_id else True,
    ).all()
    if not hr_users:
        hr_users = db.query(models.User).filter(models.User.role == "hr").all()

    cand_email = candidate.email or (candidate.user.email if candidate.user else None) or "candidate@resumo.ai"
    cand_user_id = candidate.user_id
    if not cand_user_id and cand_email:
        u = db.query(models.User).filter(models.User.email == cand_email).first()
        if u:
            cand_user_id = u.id
            candidate.user_id = u.id
            db.commit()

    if action == "approve":
        if next_approval:
            # 1. Escalate to next tier approver
            notify_approval_requested(
                db=db,
                approval=next_approval,
                application=application,
                candidate=candidate,
                job=job,
            )
            # 2. Inform HR about progression
            for hr in hr_users:
                send_notification(
                    db=db,
                    recipient_email=hr.email,
                    subject=f"Approval Escalated: {candidate.name or 'Candidate'} ({job.title})",
                    body_text=(
                        f"{actor_user.name or actor_user.email} approved {candidate.name or 'candidate'} at Step {approval.step_order} ({role_label}).\n"
                        f"Candidate has now escalated to Step {next_approval.step_order} ({next_approval.approver_role.replace('_', ' ').title()})."
                    ),
                    notification_type="approval_update",
                    user_id=hr.id,
                    reference_id=application.id,
                )
        else:
            # Terminal Approval reached!
            # 1. Notify Candidate
            send_notification(
                db=db,
                recipient_email=cand_email,
                subject=f"Application Approved: {job.title} at ReSumo",
                body_text=(
                    f"Congratulations {candidate.name or ''}!\n\n"
                    f"Your application for {job.title} has completed executive review and has been officially APPROVED.\n\n"
                    f"Our recruiting team is now preparing your formal offer letter. You will receive an alert once the offer package is ready to review."
                ),
                body_html=f"""
                <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                  <h2 style="color: #059669; margin-top: 0;">Application Approved! 🎉</h2>
                  <p>Congratulations <strong>{candidate.name or ''}</strong>! Your application for <strong>{job.title}</strong> has received final hiring authorization.</p>
                  <p>Our talent team is preparing your official offer package. Check back in your Candidate Portal shortly.</p>
                </div>
                """,
                notification_type="application_approved",
                user_id=cand_user_id,
                reference_id=application.id,
            )
            # 2. Notify HR that candidate is ready for offer
            for hr in hr_users:
                send_notification(
                    db=db,
                    recipient_email=hr.email,
                    subject=f"Final Approval Granted: {candidate.name or 'Candidate'} ({job.title})",
                    body_text=(
                        f"Executive sign-off complete!\n\n"
                        f"{actor_user.name or actor_user.email} ({role_label}) has authorized hiring for {candidate.name or 'candidate'} on {job.title}.\n"
                        f"Application status is now APPROVED. You may now draft and extend the formal offer letter in the Candidate Dossier."
                    ),
                    notification_type="approval_decision",
                    user_id=hr.id,
                    reference_id=application.id,
                )
    else:
        # Rejected
        # 1. Notify Candidate
        send_notification(
            db=db,
            recipient_email=cand_email,
            subject=f"Application Update: {job.title}",
            body_text=(
                f"Dear {candidate.name or 'Applicant'},\n\n"
                f"Thank you for interviewing for the {job.title} role at ReSumo. We appreciate the time and insight you shared with our team.\n\n"
                f"After careful consideration across our candidate pool, we will not be moving forward with your application for this position at this time.\n\n"
                f"We wish you the very best in your search."
            ),
            notification_type="application_rejected",
            user_id=cand_user_id,
            reference_id=application.id,
        )
        # 2. Notify HR
        for hr in hr_users:
            send_notification(
                db=db,
                recipient_email=hr.email,
                subject=f"Application Rejected: {candidate.name or 'Candidate'} ({job.title})",
                body_text=(
                    f"{actor_user.name or actor_user.email} ({role_label}) has rejected {candidate.name or 'candidate'} for {job.title}.\n"
                    f"Decision Notes: {approval.notes or 'None provided.'}"
                ),
                notification_type="approval_decision",
                user_id=hr.id,
                reference_id=application.id,
            )


def notify_candidate_application(
    db: Session,
    application: models.Application,
    candidate: models.Candidate,
    job: models.Job,
):
    """Sends notification to HR recruiters when a candidate submits an application."""
    hr_users = db.query(models.User).filter(
        models.User.role == "hr",
        (models.User.company_id == job.company_id) if job.company_id else True,
    ).all()
    if not hr_users:
        hr_users = db.query(models.User).filter(models.User.role == "hr").all()

    pct = round((application.similarity_score or 0.8) * 100, 1)
    subject = f"New Application: {candidate.name or candidate.email} for {job.title} ({pct}%)"
    body_text = (
        f"A new candidate application has been submitted:\n\n"
        f"Candidate: {candidate.name or 'Candidate'} ({candidate.email})\n"
        f"Requisition: {job.title} (Tier: {job.role_tier})\n"
        f"Match Score: {pct}%\n\n"
        f"Rationale: {application.rationale or 'Candidate applied via Career Portal.'}"
    )
    for hr in hr_users:
        send_notification(
            db=db,
            recipient_email=hr.email,
            subject=subject,
            body_text=body_text,
            notification_type="application_received",
            user_id=hr.id,
            reference_id=application.id,
        )
