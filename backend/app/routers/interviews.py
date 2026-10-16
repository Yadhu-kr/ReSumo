"""
Interview Scorecard & Rubric Router (Phase 5).

Endpoints:
- POST /interviews/scorecards           — Submit interview evaluation with multi-dimensional rubric scores.
- GET  /interviews/candidate/{cand_id}  — Retrieve aggregate scorecard and rubric evaluations for candidate.
- GET  /interviews/application/{app_id} — Retrieve scorecard summary scoped to application.
- DELETE /interviews/{score_id}         — Delete a scorecard entry (HR / Admin).
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/interviews", tags=["interviews"])


def compute_scorecard_summary(
    candidate_id: str,
    scores: list[models.InterviewScore],
    application_id: Optional[str] = None,
) -> schemas.CandidateScorecardSummary:
    """Helper to compute aggregate metrics across rubric dimensions."""
    if not scores:
        return schemas.CandidateScorecardSummary(
            candidate_id=candidate_id,
            application_id=application_id,
            average_score=0.0,
            total_evaluations=0,
            recommendation_consensus="pending",
            dimension_averages={},
            scores=[],
        )

    # Dimension averages
    dim_totals: dict[str, float] = {}
    dim_counts: dict[str, int] = {}
    recommendations: list[str] = []

    for s in scores:
        dim = s.dimension
        dim_totals[dim] = dim_totals.get(dim, 0.0) + s.score
        dim_counts[dim] = dim_counts.get(dim, 0) + 1
        if s.recommendation:
            recommendations.append(s.recommendation)

    dim_averages = {
        dim: round(dim_totals[dim] / dim_counts[dim], 2)
        for dim in dim_totals
    }

    avg_score = round(sum(s.score for s in scores) / len(scores), 2)

    # Determine consensus recommendation (mode or strongest)
    if recommendations:
        # Most frequent recommendation
        consensus = max(set(recommendations), key=recommendations.count)
    else:
        consensus = "hire" if avg_score >= 3.5 else "no_hire"

    return schemas.CandidateScorecardSummary(
        candidate_id=candidate_id,
        application_id=application_id,
        average_score=avg_score,
        total_evaluations=len(scores),
        recommendation_consensus=consensus,
        dimension_averages=dim_averages,
        scores=[schemas.InterviewScoreOut.model_validate(s) for s in scores],
    )


@router.post("/scorecards", response_model=schemas.CandidateScorecardSummary)
def submit_interview_scorecard(
    payload: schemas.InterviewScorecardCreate,
    current_user: models.User = Depends(require_role("hr", "approver", "admin")),
    db: Session = Depends(get_db),
):
    """
    Submits a multi-dimensional rubric evaluation for a candidate.
    Dimensions include: technical_depth, system_design, communication, cultural_alignment, role_fit.
    """
    candidate = db.query(models.Candidate).filter(models.Candidate.id == payload.candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate '{payload.candidate_id}' not found",
        )

    if payload.application_id:
        application = db.query(models.Application).filter(models.Application.id == payload.application_id).first()
        if not application:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{payload.application_id}' not found",
            )
        # HR company isolation
        if current_user.role == "hr" and current_user.company_id:
            job = db.query(models.Job).filter(models.Job.id == application.job_id).first()
            if job and job.company_id != current_user.company_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    interviewer_name = (
        payload.interviewer_name
        or getattr(current_user, "name", None)
        or current_user.email
    )

    created_scores = []
    for dim_in in payload.dimensions:
        score_row = models.InterviewScore(
            candidate_id=candidate.id,
            application_id=payload.application_id,
            interviewer_id=current_user.id,
            interviewer_name=interviewer_name,
            dimension=dim_in.dimension,
            score=dim_in.score,
            recommendation=payload.recommendation,
            notes=dim_in.notes or payload.overall_notes,
        )
        db.add(score_row)
        created_scores.append(score_row)

    db.commit()

    # Re-query all scores for candidate to return full summary
    all_scores = (
        db.query(models.InterviewScore)
        .filter(models.InterviewScore.candidate_id == payload.candidate_id)
        .order_by(models.InterviewScore.created_at.desc())
        .all()
    )

    return compute_scorecard_summary(payload.candidate_id, all_scores, payload.application_id)


@router.get("/candidate/{candidate_id}", response_model=schemas.CandidateScorecardSummary)
def get_candidate_scorecard(
    candidate_id: str,
    application_id: Optional[str] = None,
    current_user: models.User = Depends(require_role("hr", "approver", "admin")),
    db: Session = Depends(get_db),
):
    """Retrieves all rubric scores, dimension averages, and recommendation consensus for a candidate."""
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate '{candidate_id}' not found",
        )

    query = db.query(models.InterviewScore).filter(models.InterviewScore.candidate_id == candidate_id)
    if application_id:
        query = query.filter(models.InterviewScore.application_id == application_id)

    scores = query.order_by(models.InterviewScore.created_at.desc()).all()
    return compute_scorecard_summary(candidate_id, scores, application_id)


@router.get("/application/{application_id}", response_model=schemas.CandidateScorecardSummary)
def get_application_scorecard(
    application_id: str,
    current_user: models.User = Depends(require_role("hr", "approver", "admin")),
    db: Session = Depends(get_db),
):
    """Retrieves rubric scorecard scoped to a specific application."""
    application = db.query(models.Application).filter(models.Application.id == application_id).first()
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' not found",
        )

    scores = (
        db.query(models.InterviewScore)
        .filter(models.InterviewScore.application_id == application_id)
        .order_by(models.InterviewScore.created_at.desc())
        .all()
    )
    return compute_scorecard_summary(application.candidate_id, scores, application_id)


@router.delete("/{score_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interview_score(
    score_id: str,
    current_user: models.User = Depends(require_role("hr", "admin")),
    db: Session = Depends(get_db),
):
    """Deletes an interview score entry."""
    score = db.query(models.InterviewScore).filter(models.InterviewScore.id == score_id).first()
    if not score:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview score '{score_id}' not found",
        )
    if current_user.role == "hr" and score.application:
        job = db.query(models.Job).filter(models.Job.id == score.application.job_id).first()
        if job and current_user.company_id and job.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    db.delete(score)
    db.commit()
    return None


@router.post("/generate-questions", response_model=schemas.GenerateInterviewQuestionsResponse)
def generate_interview_questions(
    payload: schemas.GenerateInterviewQuestionsRequest,
    current_user: models.User = Depends(require_role("hr", "approver", "admin")),
    db: Session = Depends(get_db),
):
    """
    Generates dynamic, AI-assisted interview questions grounded in candidate accomplishments
    and job requirements, complete with 'what to look for' evaluation rubrics.
    """
    from datetime import datetime, timezone
    from app.services.llm import get_llm_provider

    candidate = db.query(models.Candidate).filter(models.Candidate.id == payload.candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate '{payload.candidate_id}' not found",
        )

    # Resolve job
    job = None
    if payload.job_id:
        job = db.query(models.Job).filter(models.Job.id == payload.job_id).first()

    # Auto-resolve from candidate's latest active application if not specified
    if not job:
        latest_app = (
            db.query(models.Application)
            .filter(models.Application.candidate_id == candidate.id)
            .order_by(models.Application.created_at.desc())
            .first()
        )
        if latest_app:
            job = db.query(models.Job).filter(models.Job.id == latest_app.job_id).first()

    parsed_info = candidate.parsed_data if isinstance(candidate.parsed_data, dict) else {}
    cand_seniority = parsed_info.get("seniority") or "Senior"
    cand_title = parsed_info.get("current_title") or "Engineer"
    cand_exp = parsed_info.get("years_experience") or 5.0
    cand_core_skills = parsed_info.get("core_skills") or []
    cand_sec_skills = parsed_info.get("secondary_skills") or []
    cand_domain = parsed_info.get("primary_domain") or "Backend & Cloud Architecture"
    cand_summary = parsed_info.get("summary") or candidate.raw_text or ""
    cand_accomplishments = parsed_info.get("key_achievements") or parsed_info.get("key_accomplishments") or []

    job_title = job.title if job else "Senior Software Engineer"
    job_desc = job.description if job else "Enterprise software systems, distributed services, and cloud architecture."
    job_tier = job.role_tier if job else cand_seniority

    # Candidate profile dictionary
    candidate_data = {
        "seniority": cand_seniority,
        "current_title": cand_title,
        "years_experience": cand_exp,
        "core_skills": cand_core_skills,
        "secondary_skills": cand_sec_skills,
        "primary_domain": cand_domain,
        "summary": cand_summary,
        "key_accomplishments": cand_accomplishments,
    }

    provider = get_llm_provider()
    raw_questions = provider.generate_interview_questions(
        job_title=job_title,
        job_description=job_desc,
        job_role_tier=job_tier,
        candidate_data=candidate_data,
        round_type=payload.round_type or "technical",
        custom_focus=payload.custom_focus,
    )

    questions = [schemas.InterviewQuestionItem(**q) for q in raw_questions]

    return schemas.GenerateInterviewQuestionsResponse(
        candidate_id=candidate.id,
        job_id=job.id if job else None,
        round_type=payload.round_type or "technical",
        total_questions=len(questions),
        questions=questions,
        generated_at=datetime.now(timezone.utc).isoformat(),
        model_provider=provider.provider_name,
    )

