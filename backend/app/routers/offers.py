"""
Offers Router: Generation, sending, and candidate acceptance/rejection of employment offers.

Endpoints:
- POST /offers/generate              — HR/Admin: Generate formal offer letter from approved application.
- GET  /offers/{offer_id}            — Retrieve offer by ID.
- GET  /offers/application/{app_id}  — Retrieve offer for application.
- GET  /offers/candidate/{cand_id}   — Retrieve offers for candidate.
- POST /offers/{offer_id}/send       — HR/Admin: Send offer to candidate (moves application to 'offered').
- POST /offers/{offer_id}/respond    — Candidate: Accept or decline employment offer.
- GET  /offers/{offer_id}/download   — Download offer letter document.
"""
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, require_role
from app.services.offers import generate_offer_letter_text

router = APIRouter(prefix="/offers", tags=["offers"])


@router.post("/generate", response_model=schemas.OfferOut, status_code=status.HTTP_201_CREATED)
def generate_offer(
    payload: schemas.OfferGenerateRequest,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Generates a formal offer letter for an application.
    Enforces multi-tenant company authorization.
    """
    application = (
        db.query(models.Application)
        .filter(models.Application.id == payload.application_id)
        .first()
    )
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{payload.application_id}' not found",
        )

    job = db.query(models.Job).filter(models.Job.id == application.job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job requisition associated with application not found",
        )

    # Multi-tenant security check for HR
    if current_user.role == "hr" and current_user.company_id and job.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: job does not belong to your company",
        )

    candidate = db.query(models.Candidate).filter(models.Candidate.id == application.candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate record not found",
        )

    company = db.query(models.Company).filter(models.Company.id == job.company_id).first()
    company_name = company.name if company else "ReSumo Partner Organization"

    role_title = payload.role_title or job.title
    candidate_name = candidate.name or (
        candidate.user.name if candidate.user else "Prospective Team Member"
    )
    candidate_email = candidate.email or (
        candidate.user.email if candidate.user else "candidate@resumo.ai"
    )

    letter_text = generate_offer_letter_text(
        company_name=company_name,
        candidate_name=candidate_name,
        candidate_email=candidate_email,
        role_title=role_title,
        salary=payload.salary,
        currency=payload.currency,
        start_date=payload.start_date,
        equity=payload.equity,
        benefits_summary=payload.benefits_summary,
        notes=payload.notes,
    )

    # Save to disk if upload dir configured
    upload_dir = os.path.join(os.getenv("UPLOAD_DIR", "uploads"), "offers")
    os.makedirs(upload_dir, exist_ok=True)

    # Check if offer already exists for this application
    existing_offer = (
        db.query(models.Offer)
        .filter(models.Offer.application_id == application.id)
        .first()
    )

    if existing_offer:
        existing_offer.role_title = role_title
        existing_offer.salary = payload.salary
        existing_offer.currency = payload.currency
        existing_offer.start_date = payload.start_date
        existing_offer.equity = payload.equity
        existing_offer.notes = payload.notes
        existing_offer.offer_letter_text = letter_text
        existing_offer.status = "draft"
        offer = existing_offer
    else:
        offer = models.Offer(
            candidate_id=candidate.id,
            application_id=application.id,
            role_title=role_title,
            salary=payload.salary,
            currency=payload.currency,
            start_date=payload.start_date,
            equity=payload.equity,
            notes=payload.notes,
            offer_letter_text=letter_text,
            status="draft",
        )
        db.add(offer)

    db.flush()
    doc_path = os.path.join(upload_dir, f"offer_{offer.id}.md")
    try:
        with open(doc_path, "w", encoding="utf-8") as f:
            f.write(letter_text)
        offer.document_path = doc_path
    except OSError:
        pass

    db.commit()
    db.refresh(offer)
    return offer


@router.get("/{offer_id}", response_model=schemas.OfferOut)
def get_offer(
    offer_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves offer details with role-based access checks."""
    offer = db.query(models.Offer).filter(models.Offer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")

    candidate = db.query(models.Candidate).filter(models.Candidate.id == offer.candidate_id).first()
    if current_user.role == "candidate" and candidate and candidate.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if current_user.role == "hr" and offer.application:
        job = db.query(models.Job).filter(models.Job.id == offer.application.job_id).first()
        if job and current_user.company_id and job.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return offer


@router.get("/application/{application_id}", response_model=schemas.OfferOut)
def get_application_offer(
    application_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves the active offer associated with an application."""
    offer = (
        db.query(models.Offer)
        .filter(models.Offer.application_id == application_id)
        .order_by(models.Offer.created_at.desc())
        .first()
    )
    if not offer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No offer found for application '{application_id}'",
        )
    return get_offer(offer.id, current_user, db)


@router.get("/candidate/{candidate_id}", response_model=list[schemas.OfferOut])
def get_candidate_offers(
    candidate_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves all offers for a candidate."""
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.role == "candidate" and candidate.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return (
        db.query(models.Offer)
        .filter(models.Offer.candidate_id == candidate_id)
        .order_by(models.Offer.created_at.desc())
        .all()
    )


@router.post("/{offer_id}/send", response_model=schemas.OfferOut)
def send_offer(
    offer_id: str,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Sends the generated offer to the candidate.
    Transitions application status to 'offered'.
    """
    offer = db.query(models.Offer).filter(models.Offer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")

    application = (
        db.query(models.Application).filter(models.Application.id == offer.application_id).first()
        if offer.application_id
        else None
    )

    if current_user.role == "hr" and application:
        job = db.query(models.Job).filter(models.Job.id == application.job_id).first()
        if job and current_user.company_id and job.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    offer.status = "sent"
    if application:
        application.status = "offered"

    db.commit()
    db.refresh(offer)
    return offer


@router.post("/{offer_id}/respond", response_model=schemas.OfferOut)
def respond_to_offer(
    offer_id: str,
    payload: schemas.OfferRespondRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Candidate responds to an offer (accept or decline).
    On accept: offer.status='accepted', application.status='hired'.
    On decline: offer.status='declined', application.status='rejected'.
    """
    offer = db.query(models.Offer).filter(models.Offer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")

    candidate = db.query(models.Candidate).filter(models.Candidate.id == offer.candidate_id).first()
    if current_user.role == "candidate" and candidate and candidate.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if offer.status not in ("sent", "draft"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot respond to offer in status '{offer.status}'",
        )

    application = (
        db.query(models.Application).filter(models.Application.id == offer.application_id).first()
        if offer.application_id
        else None
    )

    offer.responded_at = datetime.now(timezone.utc)
    if payload.notes:
        offer.notes = f"{offer.notes or ''} [Candidate Response Note: {payload.notes}]".strip()

    if payload.action == "accept":
        offer.status = "accepted"
        if application:
            application.status = "hired"
            # Auto-initialize onboarding workflow for newly hired candidate
            try:
                from app.routers.onboarding import initialize_candidate_onboarding
                job = db.query(models.Job).filter(models.Job.id == application.job_id).first()
                company_id = job.company_id if job else None
                initialize_candidate_onboarding(
                    db=db,
                    candidate_id=offer.candidate_id,
                    application_id=application.id,
                    company_id=company_id,
                )
            except Exception:
                pass
    else:
        offer.status = "declined"
        if application:
            application.status = "rejected"

    db.commit()
    db.refresh(offer)
    return offer


@router.get("/{offer_id}/download")
def download_offer(
    offer_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns downloadable raw Markdown content of the offer letter."""
    offer = get_offer(offer_id, current_user, db)
    content = offer.offer_letter_text or "# Offer Letter not generated yet"
    filename = f"Offer_Letter_{offer.role_title or 'Position'}_{offer.id[:8]}.md".replace(" ", "_")

    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
