"""
Comprehensive tests for:
1. Real Candidate Job Application
2. Interactive Kanban / Manual Status Actions
3. Offer Letter Generation Lifecycle
"""
import pytest
from app import models


def test_candidate_apply_for_job_flow(client, hr_auth, candidate_auth):
    """Test candidate applying for a job, preventing duplicates, and listing applications."""
    cand_headers, cand_user = candidate_auth
    hr_headers, hr_user = hr_auth

    # 1. Create a job via HR client
    job_res = client.post(
        "/jobs/",
        headers=hr_headers,
        json={
            "title": "Senior Python Backend Engineer",
            "description": "FastAPI, PostgreSQL, microservices architecture.",
            "role_tier": "mid",
        },
    )
    assert job_res.status_code == 201
    job = job_res.json()

    # If candidate has no resume uploaded yet, applying returns 400
    res = client.post(
        f"/jobs/{job['id']}/apply",
        headers=cand_headers,
    )
    assert res.status_code == 400
    assert "upload your resume" in res.json()["detail"].lower()

    # Now upload a resume for the candidate
    files = {"file": ("resume.txt", b"Jane Doe - Senior Python Developer with 5 years experience.", "text/plain")}
    up_res = client.post(
        "/upload-resume",
        headers=cand_headers,
        files=files,
    )
    assert up_res.status_code == 201

    # Candidate applies for the job successfully
    apply_res = client.post(
        f"/jobs/{job['id']}/apply",
        headers=cand_headers,
    )
    assert apply_res.status_code == 201
    app_data = apply_res.json()
    assert app_data["job_id"] == job["id"]
    assert app_data["status"] in ("shortlisted", "parsed")
    assert app_data["similarity_score"] is not None

    # Applying a second time returns 400 already applied
    dup_res = client.post(
        f"/jobs/{job['id']}/apply",
        headers=cand_headers,
    )
    assert dup_res.status_code == 400
    assert "already applied" in dup_res.json()["detail"].lower()

    # Candidate lists their applications via /candidates/me/applications
    my_apps = client.get(
        "/candidates/me/applications",
        headers=cand_headers,
    )
    assert my_apps.status_code == 200
    assert len(my_apps.json()) >= 1
    assert my_apps.json()[0]["job_id"] == job["id"]


def test_interactive_kanban_manual_status_update(client, hr_auth, db_session):
    """Test HR manually updating application status on Kanban (e.g. to shortlisted, rejected)."""
    headers, user = hr_auth
    company_id = user["company_id"]

    job = models.Job(company_id=company_id, title="Frontend Dev", description="React, TS", role_tier="junior")
    db_session.add(job)
    db_session.flush()

    candidate = models.Candidate(raw_resume_filename="c.pdf", raw_text="Experienced frontend dev")
    db_session.add(candidate)
    db_session.flush()

    application = models.Application(
        candidate_id=candidate.id,
        job_id=job.id,
        status="parsed",
    )
    db_session.add(application)
    db_session.commit()

    # Move application to shortlisted
    patch_res = client.patch(
        f"/candidates/applications/{application.id}/status",
        headers=headers,
        json={"status": "shortlisted", "notes": "Strong candidate match"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "shortlisted"

    # Move application to rejected
    reject_res = client.patch(
        f"/candidates/applications/{application.id}/status",
        headers=headers,
        json={"status": "rejected", "notes": "Position filled"},
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == "rejected"


def test_assign_candidate_to_job(client, hr_auth, db_session):
    """Test HR assigning an unassigned talent pool candidate to a requisition."""
    headers, user = hr_auth
    company_id = user["company_id"]

    job = models.Job(company_id=company_id, title="DevOps Lead", description="Kubernetes", role_tier="senior")
    db_session.add(job)
    db_session.flush()

    candidate = models.Candidate(raw_resume_filename="devops.pdf", raw_text="5 years Kubernetes and Terraform")
    db_session.add(candidate)
    db_session.commit()

    assign_res = client.post(
        f"/candidates/{candidate.id}/assign-job",
        headers=headers,
        json={"job_id": job.id, "initial_status": "shortlisted"},
    )
    assert assign_res.status_code == 201
    assert assign_res.json()["status"] == "shortlisted"
    assert assign_res.json()["job_id"] == job.id


def test_offer_generation_and_acceptance_lifecycle(client, hr_auth, candidate_auth, db_session):
    """Full lifecycle: Generate offer -> Send offer -> Candidate accepts -> Candidate hired."""
    hr_headers, hr_user = hr_auth
    cand_headers, cand_user = candidate_auth

    company_id = hr_user["company_id"]
    job = models.Job(company_id=company_id, title="Principal Architect", description="Architecture", role_tier="senior")
    db_session.add(job)
    db_session.flush()

    candidate = models.Candidate(
        user_id=cand_user["id"],
        name="Alex Smith",
        email="alex@example.com",
        raw_resume_filename="alex.pdf",
        raw_text="Architect",
    )
    db_session.add(candidate)
    db_session.flush()

    application = models.Application(
        candidate_id=candidate.id,
        job_id=job.id,
        status="approved",
    )
    db_session.add(application)
    db_session.commit()

    # 1. HR generates formal offer letter
    gen_res = client.post(
        "/offers/generate",
        headers=hr_headers,
        json={
            "application_id": application.id,
            "salary": 175000.0,
            "currency": "USD",
            "start_date": "2026-12-01",
            "equity": "15,000 Stock Options",
            "notes": "$10k Sign-on Bonus",
        },
    )
    assert gen_res.status_code == 201
    offer_data = gen_res.json()
    assert offer_data["status"] == "draft"
    assert offer_data["salary"] == 175000.0
    assert "OFFICIAL OFFER OF EMPLOYMENT" in offer_data["offer_letter_text"]
    offer_id = offer_data["id"]

    # 2. HR sends offer to candidate
    send_res = client.post(
        f"/offers/{offer_id}/send",
        headers=hr_headers,
    )
    assert send_res.status_code == 200
    assert send_res.json()["status"] == "sent"

    # Confirm application status updated to 'offered'
    db_session.refresh(application)
    assert application.status == "offered"

    # 3. Candidate views the offer
    view_res = client.get(
        f"/offers/{offer_id}",
        headers=cand_headers,
    )
    assert view_res.status_code == 200
    assert view_res.json()["salary"] == 175000.0

    # 4. Candidate downloads offer document
    dl_res = client.get(
        f"/offers/{offer_id}/download",
        headers=cand_headers,
    )
    assert dl_res.status_code == 200
    assert "OFFICIAL OFFER OF EMPLOYMENT" in dl_res.text

    # 5. Candidate accepts the offer
    respond_res = client.post(
        f"/offers/{offer_id}/respond",
        headers=cand_headers,
        json={"action": "accept", "notes": "Extremely excited to join the team!"},
    )
    assert respond_res.status_code == 200
    assert respond_res.json()["status"] == "accepted"

    # Confirm application transitioned to 'hired'
    db_session.refresh(application)
    assert application.status == "hired"


def test_manual_candidate_approval_and_notifications_pipeline(client, hr_auth, candidate_auth, approver_auth, db_session):
    """
    Tests the complete end-to-end flow for manually created / unassigned candidates:
    1. Unassigned candidate created in talent pool (no job).
    2. Recruiter sends direct in-app notification & email via /candidates/{id}/notify.
    3. Recruiter assigns candidate to an open requisition via /candidates/{id}/assign-job.
    4. Recruiter submits candidate for approval -> approver receives real-time notification.
    5. Approver approves candidate -> candidate and HR receive real-time notifications.
    6. HR generates and extends offer -> candidate receives offer_extended notification.
    """
    hr_headers, hr_user = hr_auth
    cand_headers, cand_user = candidate_auth
    appr_headers, appr_user = approver_auth

    company_id = hr_user["company_id"]
    # Ensure approver belongs to the same company
    approver_db = db_session.query(models.User).filter(models.User.id == appr_user["id"]).first()
    approver_db.company_id = company_id
    db_session.commit()

    # Create job requisition
    job = models.Job(company_id=company_id, title="Lead Cloud Architect", description="AWS, GCP, Terraform", role_tier="junior")
    db_session.add(job)
    db_session.flush()

    # 1. Unassigned candidate created with candidate user's email
    candidate = models.Candidate(
        user_id=cand_user["id"],
        name="Febin Abey",
        email=cand_user["email"],
        raw_resume_filename="Febin_Abey.pdf",
        raw_text="Cloud architect with deep distributed systems expertise.",
    )
    db_session.add(candidate)
    db_session.commit()

    # 2. Recruiter sends direct notification
    notify_res = client.post(
        f"/candidates/{candidate.id}/notify",
        headers=hr_headers,
        json={
            "subject": "Exciting Opportunity at ReSumo",
            "message": "We reviewed your portfolio and would like to connect.",
            "notification_type": "general",
        },
    )
    assert notify_res.status_code == 200
    notif_data = notify_res.json()
    assert notif_data["user_id"] == cand_user["id"]
    assert notif_data["subject"] == "Exciting Opportunity at ReSumo"

    # Candidate verifies notification received in their portal
    cand_notifs = client.get("/notifications/me", headers=cand_headers).json()
    assert any(n["subject"] == "Exciting Opportunity at ReSumo" for n in cand_notifs)

    # 3. Recruiter assigns candidate to job opening
    assign_res = client.post(
        f"/candidates/{candidate.id}/assign-job",
        headers=hr_headers,
        json={"job_id": job.id, "initial_status": "shortlisted"},
    )
    assert assign_res.status_code == 201
    app_id = assign_res.json()["id"]

    # 4. Submit application for approval
    submit_res = client.post(
        f"/candidates/{candidate.id}/submit-for-approval",
        headers=hr_headers,
    )
    assert submit_res.status_code == 200

    # Approver checks their notifications
    appr_notifs = client.get("/notifications/me", headers=appr_headers).json()
    assert any("Approval Required" in n["subject"] or "Lead Cloud Architect" in n["subject"] for n in appr_notifs)

    # Find the pending approval
    approval_rec = db_session.query(models.Approval).filter(models.Approval.application_id == app_id).first()
    assert approval_rec is not None
    assert approval_rec.action == "pending"

    # 5. Approver approves the candidate
    action_res = client.post(
        f"/approvals/{approval_rec.id}/action",
        headers=appr_headers,
        json={"action": "approve", "notes": "Candidate demonstrates exceptional competencies."},
    )
    assert action_res.status_code == 200
    assert action_res.json()["action"] == "approved"

    # Verify notifications generated for candidate and HR
    cand_notifs_after = client.get("/notifications/me", headers=cand_headers).json()
    assert any("Application Approved" in n["subject"] or "Hiring Authorized" in n["subject"] for n in cand_notifs_after)

    hr_notifs_after = client.get("/notifications/me", headers=hr_headers).json()
    assert any("Final Approval Granted" in n["subject"] or "Lead Cloud Architect" in n["subject"] for n in hr_notifs_after)

    # 6. HR generates offer and sends it
    gen_offer = client.post(
        "/offers/generate",
        headers=hr_headers,
        json={
            "application_id": app_id,
            "salary": 160000,
            "currency": "USD",
            "start_date": "2026-11-15",
            "notes": "Full health coverage, flexible PTO.",
        },
    )
    assert gen_offer.status_code == 201
    offer_id = gen_offer.json()["id"]

    send_offer = client.post(f"/offers/{offer_id}/send", headers=hr_headers)
    assert send_offer.status_code == 200

    # Verify candidate receives offer notification
    cand_notifs_final = client.get("/notifications/me", headers=cand_headers).json()
    assert any("Offer" in n["subject"] for n in cand_notifs_final)

