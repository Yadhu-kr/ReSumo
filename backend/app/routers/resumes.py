import os
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import require_role
from app.services.parser import extract_text

router = APIRouter(tags=["resumes"])

UPLOAD_DIR = os.getenv("RESUME_UPLOAD_DIR", "uploads/resumes")
MAX_RESUME_SIZE_MB = int(os.getenv("MAX_RESUME_SIZE_MB", "5"))
MAX_RESUME_SIZE_BYTES = MAX_RESUME_SIZE_MB * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ext.strip().lower()
    for ext in os.getenv("ALLOWED_EXTENSIONS", ".pdf,.docx,.doc,.txt").split(",")
    if ext.strip()
}


from app.services.extraction import get_extraction_provider, MockExtractionProvider


def extract_resume_fields(
    file_path: str,
    raw_text: str | None = None,
    test_mode: bool | None = None,
    resume_id: str | None = None,
) -> dict[str, Any] | None:
    """
    Adapter/Bridge for structured resume extraction.
    - If test_mode is explicitly True: returns MockExtractionProvider data.
    - If test_mode is explicitly False: returns None (unwired mode).
    - If test_mode is None: delegates to get_extraction_provider().
    """
    if test_mode is True:
        return MockExtractionProvider().extract(raw_text or "", resume_id=resume_id)
    if test_mode is False:
        return None

    provider = get_extraction_provider()
    if provider is None:
        return None

    extracted = provider.extract_resume_fields(file_path=file_path, raw_text=raw_text, resume_id=resume_id)
    if extracted is not None:
        if isinstance(extracted, schemas.ParsedResumeData):
            return extracted.model_dump()
        return extracted
    return None



@router.post(
    "/upload-resume",
    response_model=schemas.UploadResumeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_resume(
    file: UploadFile = File(...),
    job_id: Optional[str] = Form(None),
    current_user: models.User = Depends(require_role("candidate", "hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Ingest a candidate resume file with validation, size checks, and atomic storage.
    Requires authenticated candidate, recruiter (hr), or administrator user.

    1. Validates file extension against allowed types (.pdf, .docx, .doc, .txt).
    2. Enforces file size limit (default 5MB).
    3. Saves file with collision-free UUID to disk.
    4. Extracts raw plaintext via parser service and persists it on the Candidate model.
    5. Triggers extraction model/adapter (populating parsed_data if provider active).
    6. Links Candidate.user_id to the authenticated user.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided in upload request",
        )

    # 1. Extension validation
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed_list = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension '{ext}'. Allowed extensions: {allowed_list}",
        )

    # 2. Read content and enforce size limits
    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )
    if len(contents) > MAX_RESUME_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File size ({len(contents)} bytes) exceeds maximum limit of {MAX_RESUME_SIZE_MB}MB",
        )

    # 3. Save raw file to disk with unique UUID
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    stored_filename = f"{uuid.uuid4()}{ext}"
    stored_path = os.path.join(UPLOAD_DIR, stored_filename)

    with open(stored_path, "wb") as f:
        f.write(contents)

    # 4. Extract plaintext (binary -> plaintext pre-processing step for QLoRA model)
    raw_text = extract_text(stored_path)

    # 5. Database transaction with rollback and file cleanup on error
    try:
        candidate = models.Candidate(
            user_id=current_user.id if current_user.role == "candidate" else None,
            raw_resume_filename=os.path.basename(file.filename),
            raw_text=raw_text,
            parsed_status="uploaded",
        )
        db.add(candidate)
        db.commit()
        db.refresh(candidate)

        app_record = None
        if job_id:
            job = db.query(models.Job).filter(models.Job.id == job_id).first()
            if job:
                if current_user.role == "hr" and current_user.company_id and job.company_id != current_user.company_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Cannot upload candidate for another company's job",
                    )
                app_record = models.Application(
                    candidate_id=candidate.id,
                    job_id=job.id,
                    status="uploaded",
                )
                db.add(app_record)
                db.commit()
                db.refresh(app_record)

        # Attempt extraction using configured provider
        provider = get_extraction_provider()
        if provider is not None:
            extracted = None
            try:
                extracted = provider.extract_resume_fields(stored_path, raw_text=raw_text, resume_id=candidate.id)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning(
                    "Extraction provider threw unexpected exception for candidate %s: %s",
                    candidate.id,
                    exc,
                )

            if extracted is not None:
                # Successful extraction
                if isinstance(extracted, schemas.ParsedResumeData):
                    candidate.parsed_data = extracted.model_dump()
                else:
                    candidate.parsed_data = extracted
                candidate.parsed_status = "parsed"
                if app_record:
                    app_record.status = "parsed"
                db.commit()
                db.refresh(candidate)

                # Phase 2: Embed and upsert structured candidate vector into Chroma
                try:
                    from app.services.embeddings import upsert_candidate_vector
                    upsert_candidate_vector(candidate.id, candidate.parsed_data)
                except Exception:
                    pass
            else:
                # Extraction failed: preserve raw_text, mark parsed_status as extraction_failed
                candidate.parsed_status = "extraction_failed"
                if app_record:
                    app_record.status = "extraction_failed"
                db.commit()
                db.refresh(candidate)

                # Phase 2 Fallback: Upsert unstructured raw resume text into Chroma
                # so candidate remains matchable by Phase 2 RAG rather than disappearing
                try:
                    from app.services.embeddings import upsert_candidate_vector
                    if candidate.raw_text:
                        upsert_candidate_vector(candidate.id, raw_text=candidate.raw_text)
                except Exception:
                    pass
        else:
            candidate.parsed_status = "uploaded"

    except Exception:
        db.rollback()
        if os.path.exists(stored_path):
            try:
                os.remove(stored_path)
            except OSError:
                pass
        raise

    status_str = candidate.parsed_status or "uploaded"
    if status_str == "parsed":
        message = "Resume uploaded and parsed successfully."
    elif status_str == "extraction_failed":
        message = "Resume uploaded, but extraction failed to produce valid structured data. Raw text preserved."
    else:
        message = "Resume uploaded. Extraction model not yet wired in — candidate stored with status='uploaded'."

    return schemas.UploadResumeResponse(
        candidate_id=candidate.id,
        filename=file.filename,
        status=status_str,
        message=message,
    )
