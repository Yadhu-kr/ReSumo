"""
Sourcing Router — Outbound Talent Acquisition & Passive Prospect Management.

Provides endpoints for:
- POST /candidates/clip            — Recruiter quick-clip from LinkedIn/GitHub
- POST /resumes/bulk-upload        — Batch PDF ingest (up to 30 resumes)
- GET  /candidates/prospects       — List talent pool (is_passive_lead=True)
- POST /candidates/{id}/outreach   — Send magic-link outreach email
- PATCH /candidates/{id}/sourcing-status — Update CRM stage (contacted/archived/etc)
- POST /candidates/{id}/convert    — Manually convert prospect to active applicant

Profile Claim Flow (public endpoints — no JWT required):
- GET  /auth/claim-profile/verify  — Validate token, return profile preview
- POST /auth/claim-profile/activate — Set password, create User, activate account
"""

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.database import get_db
from app import models, schemas
from app.auth import create_access_token, hash_password, require_role
from app.services.parser import extract_text
from app.services.contact_extraction import extract_contact_info
from app.services.extraction import get_extraction_provider

router = APIRouter(tags=["sourcing"])

UPLOAD_DIR = os.getenv("RESUME_UPLOAD_DIR", "uploads/resumes")
MAX_RESUME_SIZE_MB = int(os.getenv("MAX_RESUME_SIZE_MB", "5"))
MAX_RESUME_SIZE_BYTES = MAX_RESUME_SIZE_MB * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ext.strip().lower()
    for ext in os.getenv("ALLOWED_EXTENSIONS", ".pdf,.docx,.doc,.txt").split(",")
    if ext.strip()
}
CLAIM_TOKEN_EXPIRY_DAYS = int(os.getenv("CLAIM_TOKEN_EXPIRY_DAYS", "14"))


def _make_token_hash(raw_token: str) -> str:
    """Hash a raw claim token using HMAC-SHA256."""
    secret = os.getenv("SECRET_KEY", "resumo-secret")
    return hmac.new(secret.encode(), raw_token.encode(), hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# Recruiter Quick-Clip
# ---------------------------------------------------------------------------

@router.post(
    "/candidates/clip",
    response_model=schemas.CandidateOut,
    status_code=status.HTTP_201_CREATED,
    summary="Clip a candidate profile from LinkedIn or GitHub into the talent pool",
)
def clip_candidate(
    payload: schemas.CandidateClipRequest,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Saves a candidate profile sourced by a recruiter (e.g. from their LinkedIn browser session
    via a future Chrome extension, or manually entered from a profile page).
    The candidate is stored as a passive lead (is_passive_lead=True) in the Talent CRM pool.
    """
    current_title = payload.current_title or payload.title
    current_company = payload.current_company or payload.company
    skills = payload.core_skills if payload.core_skills else payload.skills

    # Build synthetic raw text from structured payload for embedding
    raw_text_parts = []
    if payload.name:
        raw_text_parts.append(payload.name)
    if current_title:
        raw_text_parts.append(current_title)
    if current_company:
        raw_text_parts.append(f"at {current_company}")
    if payload.summary:
        raw_text_parts.append(payload.summary)
    if skills:
        raw_text_parts.append("Skills: " + ", ".join(skills))
    if payload.years_experience:
        raw_text_parts.append(f"{payload.years_experience} years experience")
    if payload.notes:
        raw_text_parts.append(f"Recruiter note: {payload.notes}")

    raw_text = "\n".join(raw_text_parts) if raw_text_parts else "Clipped from external source."

    parsed_data = None
    if current_title or skills or payload.years_experience:
        parsed_data = {
            "current_title": current_title,
            "current_company": current_company,
            "years_experience": payload.years_experience,
            "core_skills": skills,
            "skills": skills,
            "summary": payload.summary,
        }

    candidate = models.Candidate(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        raw_resume_filename=f"clipped_{uuid.uuid4().hex[:8]}.txt",
        raw_text=raw_text,
        parsed_data=parsed_data,
        parsed_status="parsed" if parsed_data else "uploaded",
        is_passive_lead=True,
        sourcing_channel="clipper",
        sourcing_status="sourced",
        sourcing_url=payload.sourcing_url,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    # Optionally link to a specific job requisition
    if payload.job_id:
        job = db.query(models.Job).filter(models.Job.id == payload.job_id).first()
        if job:
            app = models.Application(
                candidate_id=candidate.id,
                job_id=job.id,
                status="sourced",
            )
            db.add(app)
            db.commit()

    return candidate


# ---------------------------------------------------------------------------
# Bulk Resume Dropzone
# ---------------------------------------------------------------------------

@router.post(
    "/resumes/bulk-upload",
    response_model=schemas.BulkResumeUploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Batch ingest up to 30 resumes — parsed and stored as passive talent pool leads",
)
async def bulk_upload_resumes(
    files: list[UploadFile] = File(...),
    job_id: Optional[str] = Form(None),
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Accepts up to 30 resume files (.pdf, .docx, .txt) in one request.
    Each file is parsed independently, embedded, and stored as a passive prospect.
    Optionally links all candidates to a target job requisition.
    """
    MAX_BATCH = 30
    if len(files) > MAX_BATCH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch size limit exceeded. Maximum {MAX_BATCH} files per upload.",
        )

    # Validate job if provided
    target_job = None
    if job_id:
        target_job = db.query(models.Job).filter(models.Job.id == job_id).first()
        if not target_job:
            raise HTTPException(status_code=404, detail="Job requisition not found.")

    results: list[schemas.BulkResumeUploadResult] = []
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    provider = get_extraction_provider()

    for file in files:
        result = schemas.BulkResumeUploadResult(
            filename=file.filename or "unknown.txt",
            status="failed",
        )
        try:
            if not file.filename:
                result.error = "No filename"
                results.append(result)
                continue

            ext = os.path.splitext(file.filename)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                result.error = f"Unsupported extension '{ext}'"
                results.append(result)
                continue

            contents = await file.read()
            if len(contents) == 0:
                result.error = "Empty file"
                results.append(result)
                continue
            if len(contents) > MAX_RESUME_SIZE_BYTES:
                result.error = f"File too large (max {MAX_RESUME_SIZE_MB}MB)"
                results.append(result)
                continue

            # Save to disk
            stored_filename = f"{uuid.uuid4()}{ext}"
            stored_path = os.path.join(UPLOAD_DIR, stored_filename)
            with open(stored_path, "wb") as f:
                f.write(contents)

            # Extract text
            raw_text = extract_text(stored_path)
            contact_info = extract_contact_info(raw_text)

            candidate = models.Candidate(
                name=contact_info.get("name"),
                email=contact_info.get("email"),
                phone=contact_info.get("phone"),
                raw_resume_filename=os.path.basename(file.filename),
                raw_text=raw_text,
                parsed_status="uploaded",
                is_passive_lead=True,
                sourcing_channel="bulk_upload",
                sourcing_status="sourced",
            )
            db.add(candidate)
            db.commit()
            db.refresh(candidate)

            # AI extraction
            extracted = None
            if provider is not None:
                try:
                    extracted = await run_in_threadpool(
                        provider.extract_resume_fields, stored_path,
                        raw_text=raw_text, resume_id=candidate.id
                    )
                except Exception:
                    pass

            if extracted:
                candidate.parsed_data = extracted
                candidate.parsed_status = "parsed"
                db.commit()

            # Link to job
            match_score = None
            if target_job:
                app = models.Application(
                    candidate_id=candidate.id,
                    job_id=target_job.id,
                    status="sourced",
                )
                db.add(app)
                db.commit()

            result.candidate_id = candidate.id
            result.name = candidate.name
            result.email = candidate.email
            result.match_score = match_score
            result.status = candidate.parsed_status or "uploaded"

        except Exception as exc:
            result.error = str(exc)

        results.append(result)

    succeeded = sum(1 for r in results if r.status != "failed" and not r.error)
    return schemas.BulkResumeUploadResponse(
        total=len(results),
        succeeded=succeeded,
        failed=len(results) - succeeded,
        results=results,
    )


# ---------------------------------------------------------------------------
# Talent Pool / Prospects List
# ---------------------------------------------------------------------------

@router.get(
    "/candidates/prospects",
    response_model=list[schemas.CandidateOut],
    summary="List all passive sourced prospects (Talent CRM Pool)",
)
def list_prospects(
    sourcing_status: Optional[str] = None,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """Returns only passive leads (is_passive_lead=True) for the Talent CRM view."""
    query = db.query(models.Candidate).filter(models.Candidate.is_passive_lead == True)
    if sourcing_status:
        query = query.filter(models.Candidate.sourcing_status == sourcing_status)
    return query.order_by(models.Candidate.created_at.desc()).all()


# ---------------------------------------------------------------------------
# Send Outreach (Magic Claim Link Email)
# ---------------------------------------------------------------------------

@router.post(
    "/candidates/{candidate_id}/outreach",
    status_code=status.HTTP_200_OK,
    summary="Send personalized outreach email with a magic profile-claim link",
)
def send_outreach(
    candidate_id: str,
    payload: schemas.OutreachRequest,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Generates a time-limited magic claim token and dispatches an outreach email.
    The candidate can click the link, review their pre-parsed profile, and set a password
    to activate their account and join the active ATS pipeline.
    """
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    recipient_email = candidate.email
    if not recipient_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate has no email address. Add an email before sending outreach.",
        )

    # Determine target job
    job = None
    job_id = payload.job_id
    if not job_id:
        app = db.query(models.Application).filter(
            models.Application.candidate_id == candidate_id
        ).first()
        if app:
            job_id = app.job_id

    if job_id:
        job = db.query(models.Job).filter(models.Job.id == job_id).first()

    # Generate claim token
    raw_token = secrets.token_urlsafe(32)
    token_hash = _make_token_hash(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=CLAIM_TOKEN_EXPIRY_DAYS)

    claim_token = models.CandidateClaimToken(
        candidate_id=candidate_id,
        job_id=job_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(claim_token)
    db.commit()

    # Update sourcing status
    candidate.sourcing_status = "contacted"
    db.commit()

    # Dispatch notification/email
    base_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
    claim_url = f"{base_url}/claim-profile?token={raw_token}"
    job_title = job.title if job else "an exciting opportunity"
    company_name = job.company.name if job and job.company else "ReSumo"

    recruiter_message = payload.message or (
        f"Hi {candidate.name or 'there'},\n\n"
        f"I came across your profile and was impressed by your background. "
        f"We're building something exciting at {company_name} and believe you could be a strong fit "
        f"for our {job_title} role.\n\n"
        f"Click below to review your pre-screened profile and the full role details:\n{claim_url}\n\n"
        f"This link is valid for {CLAIM_TOKEN_EXPIRY_DAYS} days.\n\n"
        f"Best regards,\n{current_user.name or current_user.email}"
    )

    try:
        from app.services.notifications import send_notification
        send_notification(
            db=db,
            recipient_email=recipient_email,
            user_id=candidate.user_id,
            subject=f"Opportunity at {company_name}: {job_title}",
            body_text=recruiter_message,
            notification_type="outreach_invite",
            reference_id=claim_token.id,
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to send outreach notification: %s", exc)

    return {
        "status": "outreach_sent",
        "recipient_email": recipient_email,
        "candidate_id": candidate_id,
        "claim_token_id": claim_token.id,
        "claim_token": raw_token,
        "expires_at": expires_at.isoformat(),
        "claim_url_preview": claim_url,  # Returned for dev/demo only; omit in production
    }


# ---------------------------------------------------------------------------
# Update CRM Sourcing Status
# ---------------------------------------------------------------------------

@router.patch(
    "/candidates/{candidate_id}/sourcing-status",
    response_model=schemas.CandidateOut,
    summary="Update a sourced prospect's CRM stage (contacted / follow_up / archived / etc.)",
)
def update_sourcing_status(
    candidate_id: str,
    payload: schemas.CandidateSourcingStatusUpdate,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    valid_statuses = {"sourced", "contacted", "follow_up", "engaged", "converted", "archived"}
    if payload.sourcing_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sourcing_status. Must be one of: {', '.join(sorted(valid_statuses))}",
        )

    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    candidate.sourcing_status = payload.sourcing_status
    db.commit()
    db.refresh(candidate)
    return candidate


# ---------------------------------------------------------------------------
# Manual Convert to Active Applicant (Skip claim gate)
# ---------------------------------------------------------------------------

@router.post(
    "/candidates/{candidate_id}/convert",
    response_model=schemas.CandidateOut,
    summary="Manually convert a passive prospect to an active applicant (bypasses email gate)",
)
def convert_prospect_to_applicant(
    candidate_id: str,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Used when a candidate expresses verbal interest (e.g. at a career fair or referral call).
    Immediately flips is_passive_lead=False and updates application status to 'shortlisted'.
    """
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    candidate.is_passive_lead = False
    candidate.sourcing_status = "converted"
    candidate.claimed_at = datetime.now(timezone.utc)
    db.commit()

    # Upgrade any linked "sourced" applications to "shortlisted"
    for app in candidate.applications:
        if app.status == "sourced":
            app.status = "shortlisted"
    db.commit()
    db.refresh(candidate)
    return candidate


# ---------------------------------------------------------------------------
# PUBLIC: Verify Claim Token
# ---------------------------------------------------------------------------

@router.get(
    "/auth/claim-profile/verify",
    response_model=schemas.ClaimProfileVerificationResponse,
    summary="Validate a magic claim token and return candidate profile preview (public endpoint)",
)
def verify_claim_token(
    token: str,
    db: Session = Depends(get_db),
):
    """Public endpoint — no authentication required. Validates token and returns profile data."""
    token_hash = _make_token_hash(token)
    claim = db.query(models.CandidateClaimToken).filter(
        models.CandidateClaimToken.token_hash == token_hash,
    ).first()

    if not claim:
        raise HTTPException(status_code=404, detail="Invalid or unrecognized claim token.")

    now = datetime.now(timezone.utc)
    is_expired = claim.expires_at.replace(tzinfo=timezone.utc) < now

    candidate = claim.candidate
    job = claim.job

    parsed = candidate.parsed_data or {}
    return schemas.ClaimProfileVerificationResponse(
        candidate_id=candidate.id,
        name=candidate.name,
        current_title=parsed.get("current_title"),
        core_skills=parsed.get("core_skills", []),
        years_experience=parsed.get("years_experience"),
        job_title=job.title if job else None,
        job_id=job.id if job else None,
        company_name=job.company.name if job and job.company else None,
        role_tier=job.role_tier if job else None,
        match_score=None,  # Could compute here if embedding is available
        is_expired=is_expired,
    )


# ---------------------------------------------------------------------------
# PUBLIC: Activate Claimed Profile
# ---------------------------------------------------------------------------

@router.post(
    "/auth/claim-profile/activate",
    response_model=schemas.TokenResponse,
    summary="Activate account from magic claim token — creates User, links Candidate, returns JWT",
)
def activate_claimed_profile(
    payload: schemas.ClaimProfileActivationRequest,
    db: Session = Depends(get_db),
):
    """
    Completes the candidate conversion gate:
    1. Validates token and expiry.
    2. Creates a new models.User with role='candidate'.
    3. Links candidate.user_id = user.id.
    4. Flips candidate.is_passive_lead = False, claimed_at = now.
    5. Updates linked 'sourced' application status to 'shortlisted'.
    6. Sends welcome notification (in-app + email).
    7. Returns a JWT so the candidate is instantly logged in.
    """
    token_hash = _make_token_hash(payload.token)
    claim = db.query(models.CandidateClaimToken).filter(
        models.CandidateClaimToken.token_hash == token_hash,
    ).first()

    if not claim:
        raise HTTPException(status_code=400, detail="Invalid claim token.")

    now = datetime.now(timezone.utc)
    if claim.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=400, detail="This invitation link has expired. Please ask the recruiter to send a new one.")

    if claim.used_at is not None:
        raise HTTPException(status_code=400, detail="This invitation link has already been used.")

    candidate = claim.candidate

    # Determine email
    email = payload.email or candidate.email
    if not email:
        raise HTTPException(status_code=400, detail="An email address is required to create your account.")

    # Check for existing user
    existing_user = db.query(models.User).filter(models.User.email == email).first()
    if existing_user:
        # Re-link existing user if they somehow already have an account
        candidate.user_id = existing_user.id
    else:
        new_user = models.User(
            email=email,
            name=payload.name or candidate.name,
            password_hash=hash_password(payload.password),
            role="candidate",
            company_id=None,
        )
        db.add(new_user)
        db.flush()
        candidate.user_id = new_user.id
        existing_user = new_user

    # Update candidate contact info if provided
    if payload.name:
        candidate.name = payload.name
    if payload.email:
        candidate.email = payload.email
    if payload.phone:
        candidate.phone = payload.phone

    # Mark as converted
    candidate.is_passive_lead = False
    candidate.sourcing_status = "converted"
    candidate.claimed_at = now

    # Mark token as used
    claim.used_at = now

    db.commit()

    # Upgrade linked applications
    for app in candidate.applications:
        if app.status == "sourced":
            app.status = "shortlisted"
    db.commit()

    # Send welcome notification
    try:
        from app.services.notifications import send_notification
        job = claim.job
        job_title = job.title if job else "the position"
        send_notification(
            db=db,
            recipient_email=email,
            user_id=existing_user.id,
            subject=f"Welcome to ReSumo! Your application for {job_title} is now active.",
            body_text=(
                f"Hi {candidate.name or 'there'},\n\n"
                f"Your profile has been activated and your application for {job_title} is now in the "
                f"active review pipeline. Log in to your Candidate Portal to track progress, view your "
                f"interview schedule, and review any offers.\n\n"
                f"Best of luck!"
            ),
            notification_type="account_activated",
            reference_id=candidate.id,
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to send welcome notification: %s", exc)

    # Return JWT for immediate login
    token = create_access_token(data={"sub": existing_user.id, "role": existing_user.role})
    return schemas.TokenResponse(access_token=token)
