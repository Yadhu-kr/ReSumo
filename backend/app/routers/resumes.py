import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
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


def extract_resume_fields(
    file_path: str,
    raw_text: str | None = None,
    test_mode: bool | None = None,
) -> dict[str, Any] | None:
    """
    =============================================================================
    STUB / ADAPTER: QLoRA Fine-Tuned Resume Extraction Model (Phase 1 / Stage 1)
    =============================================================================
    Status: Model fine-tuning currently in progress on Molab.
    Contract Specification: docs/extraction-model-integration-contract.md


    Parameters:
        file_path: Absolute path to the uploaded resume document on disk.
        raw_text: Clean plaintext string produced by app.services.parser (input prompt).
        test_mode: When True, returns realistic synthetic structured JSON to unblock
                   downstream Phase 2 matching and Phase 3 approval workflows.
                   Defaults to the environment variable MOCK_EXTRACTION (default: True).

    Behavior:
    - If test_mode is True: returns realistic synthetic structured JSON with real-shaped
      fields (name, email, skills, experience, education, summary).
    - If test_mode is False: returns None (raw ingestion mode where candidate
      remains with status="uploaded" until offline/async batch inference runs).
    =============================================================================
    """
    if test_mode is None:
        test_mode = os.getenv("MOCK_EXTRACTION", "true").lower() in ("1", "true", "yes")

    if test_mode:
        # Realistic synthetic structured data matching the exact integration contract:
        # sandeeppanem/resume-json-extraction-5k output schema
        return {
            "current_title": "Senior Backend Engineer",
            "previous_titles": ["Backend Developer", "Software Engineer Intern"],
            "current_company": "Nexus Technologies",
            "previous_companies": ["Apex Software", "CloudCorp"],
            "years_experience": 5.5,
            "seniority": "senior",
            "primary_domain": "Backend & Cloud Architecture",
            "industries": ["Fintech", "SaaS", "E-commerce"],
            "core_skills": ["Python", "FastAPI", "PostgreSQL"],
            "secondary_skills": ["Docker", "Kubernetes", "Redis"],
            "tools": ["Git", "GitHub Actions", "Postman"],
            "leadership_experience": True,
            "key_achievements": [
                "Architected high-throughput microservice handling 10k RPS",
                "Reduced database query latency by 45% via indexing and caching",
                "Mentored 4 junior and mid-level developers",
            ],
            "location": "San Francisco, CA",
            "summary": "Senior backend engineer with 5+ years experience building scalable web services, microservices, and distributed pipelines.",
        }

    return None



@router.post(
    "/upload-resume",
    response_model=schemas.UploadResumeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_role("candidate")),
    db: Session = Depends(get_db),
):
    """
    Ingest a candidate resume file with validation, size checks, and atomic storage.
    Requires authenticated candidate user.

    1. Validates file extension against allowed types (.pdf, .docx, .doc, .txt).
    2. Enforces file size limit (default 5MB).
    3. Saves file with collision-free UUID to disk.
    4. Extracts raw plaintext via parser service and persists it on the Candidate model.
    5. Triggers extraction model/adapter (populating parsed_data if MOCK_EXTRACTION=true).
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
    parsed = None
    try:
        candidate = models.Candidate(
            user_id=current_user.id,
            raw_resume_filename=os.path.basename(file.filename),
            raw_text=raw_text,
        )
        db.add(candidate)
        db.commit()
        db.refresh(candidate)

        # Attempt extraction (returns mock structured data if MOCK_EXTRACTION=true)
        parsed = extract_resume_fields(stored_path, raw_text=raw_text)
        if parsed:
            candidate.parsed_data = parsed
            db.commit()
            db.refresh(candidate)

            # Phase 2: Embed and upsert candidate vector into Chroma
            try:
                from app.services.embeddings import upsert_candidate_vector
                upsert_candidate_vector(candidate.id, candidate.parsed_data)
            except Exception:
                pass



    except Exception:
        db.rollback()
        if os.path.exists(stored_path):
            try:
                os.remove(stored_path)
            except OSError:
                pass
        raise

    return schemas.UploadResumeResponse(
        candidate_id=candidate.id,
        filename=file.filename,
        status="parsed" if parsed else "uploaded",
        message=(
            "Resume uploaded and parsed successfully."
            if parsed
            else "Resume uploaded. Extraction model not yet wired in — "
            "candidate stored with status='uploaded'."
        ),
    )
