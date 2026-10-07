import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/", response_model=schemas.JobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    job: schemas.JobCreate,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """Create a new job posting. Auto-sets company_id from the authenticated HR user."""
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account is not associated with a company",
        )

    db_job = models.Job(
        title=job.title,
        description=job.description,
        role_tier=job.role_tier,
        company_id=current_user.company_id,
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)

    # Phase 2: Embed and upsert job into Chroma vector store
    try:
        from app.services.embeddings import upsert_job_vector
        upsert_job_vector(db_job.id, db_job.title, db_job.description, db_job.role_tier)
    except Exception:
        pass

    return db_job


@router.get("/", response_model=list[schemas.JobOut])
def list_jobs(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List jobs. HR/approver see only their company's jobs; admin sees all.
    Candidates see all jobs (they need to discover openings).
    """
    query = db.query(models.Job)
    if current_user.role in ("hr", "approver"):
        query = query.filter(models.Job.company_id == current_user.company_id)
    # candidate and admin see all jobs
    return query.order_by(models.Job.created_at.desc()).all()


@router.get("/{job_id}", response_model=schemas.JobOut)
def get_job(
    job_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # HR/approver can only see their company's jobs
    if current_user.role in ("hr", "approver") and job.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return job


@router.put("/{job_id}", response_model=schemas.JobOut)
def update_job(
    job_id: str,
    job_update: schemas.JobUpdate,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """Updates fields on an existing job. HR can only update their company's jobs."""
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if current_user.role == "hr" and job.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    update_data = job_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)

    db.commit()
    db.refresh(job)

    # Phase 2: Update job vector in Chroma
    try:
        from app.services.embeddings import upsert_job_vector
        upsert_job_vector(job.id, job.title, job.description, job.role_tier)
    except Exception:
        pass

    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: str,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """Deletes a job. HR can only delete their company's jobs."""
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if current_user.role == "hr" and job.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    db.delete(job)
    db.commit()

    # Phase 2: Remove job vector from Chroma
    try:
        from app.services.embeddings import delete_job_vector
        delete_job_vector(job_id)
    except Exception:
        pass

    return None


@router.post("/{job_id}/matches", response_model=schemas.JobMatchesResponse)
def match_candidates_for_job(
    job_id: str,
    match_req: schemas.MatchRequest = schemas.MatchRequest(),
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """
    Phase 2: RAG-based candidate matching for a job opening.

    1. Retrieves job details from database (company-scoped for HR).
    2. Constructs job query text from title, role_tier, and description.
    3. Queries Chroma candidates collection using cosine similarity.
    4. Filters out candidates who already have an Application for this job.
    5. Creates Application records for qualifying matches instead of mutating Candidate.
    6. Generates evidence-grounded match rationale via the configured LLMProvider.
    7. Returns ranked candidates with similarity scores, rationales, and Application IDs.
    """
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # HR can only match against their own company's jobs
    if current_user.role == "hr" and job.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    from app.services.embeddings import build_job_embedding_text, query_top_candidates
    from app.services.llm import get_llm_provider

    threshold = float(os.getenv("MATCH_SIMILARITY_THRESHOLD", "0.60"))
    min_score = max(match_req.min_score, 0.0)

    job_text = build_job_embedding_text(job.title, job.description, job.role_tier)
    hits = query_top_candidates(job_text, top_k=match_req.top_k)

    # Get candidate IDs that already have applications for this job
    existing_app_cids = set(
        cid for (cid,) in db.query(models.Application.candidate_id)
        .filter(models.Application.job_id == job_id)
        .all()
    )

    llm = get_llm_provider()
    matches_out: list[schemas.CandidateMatchOut] = []

    for hit in hits:
        cid = hit["candidate_id"]
        sim = hit["similarity_score"]

        if sim < min_score:
            continue

        # Skip candidates who already applied to this job
        if cid in existing_app_cids:
            continue

        candidate = db.query(models.Candidate).filter(models.Candidate.id == cid).first()
        if not candidate or not candidate.parsed_data:
            continue

        # Generate defensible LLM match rationale citing seniority, core_skills, years_experience
        rationale = llm.generate_match_rationale(
            job_title=job.title,
            job_description=job.description,
            job_role_tier=job.role_tier,
            candidate_data=candidate.parsed_data,
            similarity_score=sim,
        )

        # Determine application status based on threshold
        app_status = "shortlisted" if sim >= threshold else "parsed"

        # Create Application record
        application = models.Application(
            candidate_id=candidate.id,
            job_id=job.id,
            status=app_status,
            similarity_score=sim,
            rationale=rationale,
            rationale_source=getattr(llm, "provider_name", "mock"),
        )
        db.add(application)
        db.flush()  # get application.id

        matches_out.append(
            schemas.CandidateMatchOut(
                candidate=schemas.CandidateOut.model_validate(candidate),
                application=schemas.ApplicationOut.model_validate(application),
                similarity_score=sim,
                similarity_percentage=round(sim * 100, 1),
                rationale=rationale,
                rationale_source=getattr(llm, "provider_name", "mock"),
            )
        )

    db.commit()

    return schemas.JobMatchesResponse(
        job_id=job.id,
        job_title=job.title,
        matches=matches_out,
        count=len(matches_out),
    )


def seed_demo_jobs_and_applications_if_empty(db: Session):
    """
    Seed demo jobs and link existing candidates to applications for the primary company
    so the Kanban pipeline and requisitions display realistic, interactive data.
    """
    try:
        company = (
            db.query(models.Company)
            .filter(models.Company.name.in_(["ReSumo Tech", "ReSumo Technologies"]))
            .first()
        )
        if not company:
            company = db.query(models.Company).first()
        if not company:
            return

        demo_jobs = db.query(models.Job).filter(models.Job.company_id == company.id).all()
        if not demo_jobs:
            job_specs = [
                ("Senior Full-Stack Engineer", "Lead frontend (React/TS) and backend (FastAPI/Python) architecture for enterprise HR tech.", "senior"),
                ("AI / ML Systems Engineer", "Design RAG retrieval systems, Chroma vector pipelines, and fine-tuned QLoRA models.", "mid"),
                ("Lead DevOps & Infrastructure Engineer", "Automate Docker pipelines, SQLite/PostgreSQL migrations, and tenant isolation.", "senior"),
            ]
            for title, desc, tier in job_specs:
                db_job = models.Job(title=title, description=desc, role_tier=tier, company_id=company.id)
                db.add(db_job)
            db.commit()
            demo_jobs = db.query(models.Job).filter(models.Job.company_id == company.id).all()

            try:
                from app.services.embeddings import upsert_job_vector
                for j in demo_jobs:
                    upsert_job_vector(j.id, j.title, j.description, j.role_tier)
            except Exception:
                pass

        if not demo_jobs:
            return

        existing_apps = (
            db.query(models.Application)
            .join(models.Job, models.Job.id == models.Application.job_id)
            .filter(models.Job.company_id == company.id)
            .count()
        )
        if existing_apps == 0:
            candidates = db.query(models.Candidate).order_by(models.Candidate.created_at.asc()).all()
            parsed_cands = [c for c in candidates if c.parsed_status == "parsed"]
            uploaded_cands = [c for c in candidates if c.parsed_status == "uploaded"]
            failed_cands = [c for c in candidates if c.parsed_status == "extraction_failed"]

            stages = ["parsed", "parsed", "shortlisted", "shortlisted", "pending_approval", "pending_approval", "approved", "approved"]
            for idx, c in enumerate(parsed_cands):
                stage = stages[idx % len(stages)]
                job = demo_jobs[idx % len(demo_jobs)]
                sim_score = 0.82 + (idx * 0.02)
                app = models.Application(
                    candidate_id=c.id,
                    job_id=job.id,
                    status=stage,
                    similarity_score=round(sim_score, 2),
                    rationale=f"Candidate demonstrates strong proficiency aligned with {job.title} requisitions.",
                    rationale_source="mock",
                )
                db.add(app)
                db.flush()

                if stage == "pending_approval":
                    from app.models import Approval
                    existing_approval = db.query(Approval).filter(Approval.application_id == app.id).first()
                    if not existing_approval:
                        appr = Approval(
                            application_id=app.id,
                            approver_role="hiring_manager",
                            step_order=1,
                            action="pending",
                        )
                        db.add(appr)

            for idx, c in enumerate(uploaded_cands):
                job = demo_jobs[idx % len(demo_jobs)]
                app = models.Application(
                    candidate_id=c.id,
                    job_id=job.id,
                    status="uploaded",
                )
                db.add(app)

            for idx, c in enumerate(failed_cands):
                job = demo_jobs[idx % len(demo_jobs)]
                app = models.Application(
                    candidate_id=c.id,
                    job_id=job.id,
                    status="extraction_failed",
                )
                db.add(app)

            db.commit()
    except Exception as exc:
        db.rollback()
        print(f"Warning: Failed to seed demo jobs and applications: {exc}")
