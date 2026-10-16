"""
Interview Calendar and Universal iCalendar (.ics) integration routes.
Enables slot scheduling, meeting video links, and universal calendar downloads.
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.services.notifications import notify_interview_scheduled

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _generate_ics_string(schedule: models.InterviewSchedule, candidate_name: str, interviewer_name: str) -> str:
    """
    Generates standard RFC 5545 iCalendar content for Google Calendar,
    Apple Calendar, Outlook, and mobile calendar apps.
    """
    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    
    # Format start and end in UTC
    st = schedule.start_time
    if st.tzinfo is None:
        st = st.replace(tzinfo=timezone.utc)
    else:
        st = st.astimezone(timezone.utc)
        
    et = schedule.end_time
    if et.tzinfo is None:
        et = et.replace(tzinfo=timezone.utc)
    else:
        et = et.astimezone(timezone.utc)
        
    dtstart = st.strftime("%Y%m%dT%H%M%SZ")
    dtend = et.strftime("%Y%m%dT%H%M%SZ")
    
    summary = f"Interview: {schedule.title} - {candidate_name}"
    description = (
        f"ReSumo Interview Session\\n\\n"
        f"Round: {schedule.title} ({schedule.round_type})\\n"
        f"Candidate: {candidate_name}\\n"
        f"Interviewer: {interviewer_name}\\n"
        f"Duration: {schedule.duration_minutes} minutes\\n"
        f"Video Link: {schedule.meeting_link or 'Provided in dashboard'}\\n\\n"
        f"Notes: {schedule.notes or 'None'}"
    )
    location = schedule.meeting_link or "Virtual Meeting / ReSumo Platform"
    status_str = "CONFIRMED" if schedule.status == "scheduled" else schedule.status.upper()

    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ReSumo//Interview Scheduling Platform//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:interview-{schedule.id}@resumo.ai",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART:{dtstart}",
        f"DTEND:{dtend}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"LOCATION:{location}",
        f"STATUS:{status_str}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(ics_lines) + "\r\n"


@router.post("/schedule", response_model=schemas.InterviewScheduleOut, status_code=status.HTTP_201_CREATED)
def schedule_interview(
    payload: schemas.InterviewScheduleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Schedule an interview round for a candidate.
    Dispatches automated calendar notifications to candidate and interviewer.
    """
    if current_user.role not in ("hr", "admin", "approver", "interviewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters, interviewers, approvers, or admins can schedule interviews",
        )

    candidate = db.query(models.Candidate).filter(models.Candidate.id == payload.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    company_id = current_user.company_id
    job_id = None
    if payload.application_id:
        app_rec = db.query(models.Application).filter(models.Application.id == payload.application_id).first()
        if app_rec:
            company_id = company_id or (app_rec.job.company_id if app_rec.job else None)
            job_id = app_rec.job_id

    duration = payload.duration_minutes or 45
    start_dt = payload.start_time
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    end_dt = start_dt + timedelta(minutes=duration)

    interviewer_name = payload.interviewer_name
    interviewer_email = None
    if payload.interviewer_id:
        interviewer = db.query(models.User).filter(models.User.id == payload.interviewer_id).first()
        if interviewer:
            if not interviewer_name:
                interviewer_name = interviewer.name or interviewer.email
            interviewer_email = interviewer.email
    if not interviewer_name:
        interviewer_name = current_user.name or current_user.email

    schedule = models.InterviewSchedule(
        company_id=company_id,
        job_id=job_id,
        candidate_id=candidate.id,
        application_id=payload.application_id,
        interviewer_id=payload.interviewer_id,
        interviewer_name=interviewer_name,
        title=payload.title or "Technical Architecture & Coding Interview",
        round_type=payload.round_type or "technical",
        start_time=start_dt,
        end_time=end_dt,
        duration_minutes=duration,
        meeting_link=payload.meeting_link,
        status="scheduled",
        notes=payload.notes,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    # Automated Email / Notification Dispatch
    candidate_email = candidate.email
    if not candidate_email and candidate.user:
        candidate_email = candidate.user.email

    if candidate_email:
        notify_interview_scheduled(
            db=db,
            schedule=schedule,
            candidate=candidate,
            candidate_email=candidate_email,
            interviewer_email=interviewer_email,
        )

    return schedule


@router.get("/candidate/{candidate_id}", response_model=List[schemas.InterviewScheduleOut])
def get_candidate_schedules(
    candidate_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Returns all interview schedules for a candidate."""
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if current_user.role == "candidate" and candidate.user_id != current_user.id and candidate.email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    schedules = (
        db.query(models.InterviewSchedule)
        .filter(models.InterviewSchedule.candidate_id == candidate_id)
        .order_by(models.InterviewSchedule.start_time.asc())
        .all()
    )
    return schedules


@router.get("/application/{application_id}", response_model=List[schemas.InterviewScheduleOut])
def get_application_schedules(
    application_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Returns all interview schedules linked to a job application."""
    schedules = (
        db.query(models.InterviewSchedule)
        .filter(models.InterviewSchedule.application_id == application_id)
        .order_by(models.InterviewSchedule.start_time.asc())
        .all()
    )
    return schedules


@router.get("/my-schedules", response_model=List[schemas.InterviewScheduleOut])
def get_my_schedules(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns upcoming/past interview schedules for the logged-in user.
    If Candidate: returns schedules linked to their candidate profile.
    If HR/Admin/Approver: returns schedules where they are interviewer or in their company.
    """
    if current_user.role == "candidate":
        cand = db.query(models.Candidate).filter(
            or_(
                models.Candidate.user_id == current_user.id,
                models.Candidate.email == current_user.email,
            )
        ).first()
        if not cand:
            return []
        return (
            db.query(models.InterviewSchedule)
            .filter(models.InterviewSchedule.candidate_id == cand.id)
            .order_by(models.InterviewSchedule.start_time.asc())
            .all()
        )
    else:
        # Recruiter / Approver / Admin
        query = db.query(models.InterviewSchedule)
        if current_user.company_id and current_user.role != "admin":
            query = query.filter(
                or_(
                    models.InterviewSchedule.company_id == current_user.company_id,
                    models.InterviewSchedule.interviewer_id == current_user.id,
                )
            )
        return query.order_by(models.InterviewSchedule.start_time.asc()).all()


@router.patch("/schedules/{schedule_id}", response_model=schemas.InterviewScheduleOut)
def update_schedule(
    schedule_id: str,
    payload: schemas.InterviewScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Updates interview status (e.g. cancelled/completed), link, or notes."""
    schedule = db.query(models.InterviewSchedule).filter(models.InterviewSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    if payload.status is not None:
        schedule.status = payload.status
    if payload.meeting_link is not None:
        schedule.meeting_link = payload.meeting_link
    if payload.notes is not None:
        schedule.notes = payload.notes

    db.commit()
    db.refresh(schedule)
    return schedule


@router.get("/schedules/{schedule_id}/ics")
def download_ics(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Downloads an RFC 5545 universal iCalendar (.ics) file for Google Calendar,
    Apple Calendar, Outlook, and smartphones.
    """
    schedule = db.query(models.InterviewSchedule).filter(models.InterviewSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    candidate_name = schedule.candidate.name if schedule.candidate and schedule.candidate.name else "Candidate"
    interviewer_name = schedule.interviewer_name or "Hiring Team"

    ics_content = _generate_ics_string(schedule, candidate_name, interviewer_name)
    filename = f"interview-{schedule_id}.ics"

    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )
