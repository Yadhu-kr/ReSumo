"""
Integration tests for Interview Scorecards & Rubrics (Phase 5) and Post-Offer Onboarding Checklist.
"""
import pytest
from app import models


def test_interview_scorecard_lifecycle(client, hr_auth, db_session):
    """Verifies multi-dimensional interview scorecard submission, aggregation, and deletion."""
    hr_headers, hr_user = hr_auth

    # 1. Create a candidate
    candidate = models.Candidate(
        name="Elena Rostova",
        email="elena.rostova@engineer.dev",
        raw_resume_filename="elena_cv.pdf",
        raw_text="Staff distributed systems engineer with expertise in Go, Raft, and distributed systems.",
        parsed_status="parsed",
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    # 2. Submit interview scorecard
    payload = {
        "candidate_id": candidate.id,
        "interviewer_name": "Marcus Vance (Principal Architect)",
        "recommendation": "strong_hire",
        "overall_notes": "Exceptional command of distributed consensus algorithms and fault recovery.",
        "dimensions": [
            {"dimension": "technical_depth", "score": 5.0, "notes": "Deep knowledge of Raft log compaction"},
            {"dimension": "system_design", "score": 4.5, "notes": "Solid horizontal partitioning architecture"},
            {"dimension": "communication", "score": 4.0, "notes": "Clear articulation of trade-offs"},
            {"dimension": "cultural_alignment", "score": 4.5, "notes": "Values high team velocity and mentorship"},
            {"dimension": "role_fit", "score": 5.0, "notes": "Exact match for our distributed storage engine"},
        ],
    }

    resp = client.post("/interviews/scorecards", json=payload, headers=hr_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["candidate_id"] == candidate.id
    assert data["total_evaluations"] == 5
    assert data["average_score"] == 4.6
    assert data["recommendation_consensus"] == "strong_hire"
    assert data["dimension_averages"]["technical_depth"] == 5.0
    assert data["dimension_averages"]["communication"] == 4.0

    # 3. Retrieve candidate scorecard summary
    resp_get = client.get(f"/interviews/candidate/{candidate.id}", headers=hr_headers)
    assert resp_get.status_code == 200
    summary = resp_get.json()
    assert summary["average_score"] == 4.6
    assert len(summary["scores"]) == 5

    # 4. Delete one score entry
    score_id_to_del = summary["scores"][0]["id"]
    del_resp = client.delete(f"/interviews/{score_id_to_del}", headers=hr_headers)
    assert del_resp.status_code == 204

    # Re-fetch: should have 4 scores now
    refetch = client.get(f"/interviews/candidate/{candidate.id}", headers=hr_headers).json()
    assert refetch["total_evaluations"] == 4


def test_onboarding_lifecycle(client, hr_auth, candidate_auth, db_session):
    """Verifies initialization, candidate task completion, and HR task verification."""
    hr_headers, hr_user = hr_auth
    cand_headers, cand_user = candidate_auth

    # Create candidate linked to candidate user
    candidate = models.Candidate(
        user_id=cand_user["id"],
        name="Candidate User",
        email=cand_user["email"],
        raw_resume_filename="candidate_cv.pdf",
        raw_text="Experienced engineer.",
        parsed_status="parsed",
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    # 1. Initialize onboarding
    init_resp = client.post(f"/onboarding/initialize/{candidate.id}", headers=hr_headers)
    assert init_resp.status_code == 200, init_resp.text
    data = init_resp.json()

    assert data["total_tasks"] == 6
    assert data["completed_tasks"] == 0
    assert data["progress_percentage"] == 0.0
    assert not data["is_complete"]

    # 2. Candidate views onboarding checklist via /onboarding/me
    my_resp = client.get("/onboarding/me", headers=cand_headers)
    assert my_resp.status_code == 200
    my_tasks = my_resp.json()["tasks"]
    assert len(my_tasks) == 6

    # Find the IT Provisioning task
    it_task = next(t for t in my_tasks if t["category"] == "it_provisioning")

    # 3. Candidate completes IT provisioning task
    update_payload = {
        "status": "completed",
        "form_data": {
            "workstation_choice": "Apple M3 Max MacBook Pro 16-inch (64GB RAM, 1TB SSD)",
            "shipping_address": "742 Evergreen Terrace, Springfield, OR 97477",
            "t_shirt_size": "L",
        },
    }
    patch_resp = client.patch(f"/onboarding/tasks/{it_task['id']}", json=update_payload, headers=cand_headers)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "completed"
    assert patch_resp.json()["form_data"]["workstation_choice"] == "Apple M3 Max MacBook Pro 16-inch (64GB RAM, 1TB SSD)"

    # 4. HR verifies compliance I-9 task
    i9_task = next(t for t in my_tasks if t["category"] == "compliance")
    verify_resp = client.post(f"/onboarding/tasks/{i9_task['id']}/verify", headers=hr_headers)
    assert verify_resp.status_code == 200
    assert verify_resp.json()["status"] == "verified"
    assert verify_resp.json()["verified_at"] is not None

    # 5. Check overall onboarding summary
    summary_resp = client.get(f"/onboarding/candidate/{candidate.id}", headers=hr_headers)
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["completed_tasks"] == 2
    assert summary["verified_tasks"] == 1
    assert summary["progress_percentage"] > 30.0


def test_offer_acceptance_auto_triggers_onboarding(client, hr_auth, candidate_auth, db_session):
    """Verifies that candidate accepting an offer automatically triggers onboarding initialization."""
    hr_headers, hr_user = hr_auth
    cand_headers, cand_user = candidate_auth

    # Create job & candidate & approved application
    job = models.Job(
        company_id=hr_user["company_id"],
        title="Staff Distributed Systems Architect",
        description="Design high-throughput distributed consensus engines.",
        role_tier="senior",
    )
    candidate = models.Candidate(
        user_id=cand_user["id"],
        name="Elena Rostova",
        email=cand_user["email"],
        raw_resume_filename="elena_cv.pdf",
        raw_text="Staff distributed systems engineer.",
        parsed_status="parsed",
    )
    db_session.add_all([job, candidate])
    db_session.commit()
    db_session.refresh(job)
    db_session.refresh(candidate)

    application = models.Application(
        candidate_id=candidate.id,
        job_id=job.id,
        status="approved",
        similarity_score=0.94,
    )
    db_session.add(application)
    db_session.commit()
    db_session.refresh(application)

    # Generate offer
    gen_payload = {
        "application_id": application.id,
        "salary": 185000,
        "currency": "USD",
        "start_date": "2026-11-01",
        "equity": "0.4% stock options (4-year vesting, 1-year cliff)",
        "role_title": "Staff Distributed Systems Architect",
        "benefits_summary": "Comprehensive premium medical, dental, 401(k) 5% match, annual learning stipend.",
    }
    gen_resp = client.post("/offers/generate", json=gen_payload, headers=hr_headers)
    assert gen_resp.status_code in (200, 201)
    offer_id = gen_resp.json()["id"]

    # Dispatch offer
    send_resp = client.post(f"/offers/{offer_id}/send", headers=hr_headers)
    assert send_resp.status_code == 200

    # Candidate accepts offer
    accept_resp = client.post(
        f"/offers/{offer_id}/respond",
        json={"action": "accept", "notes": "Thrilled to join the Apex Cloud distributed systems team!"},
        headers=cand_headers,
    )
    assert accept_resp.status_code == 200
    assert accept_resp.json()["status"] == "accepted"

    # Confirm onboarding checklist is initialized and active for candidate
    onb_resp = client.get("/onboarding/me", headers=cand_headers)
    assert onb_resp.status_code == 200
    onb_data = onb_resp.json()
    assert onb_data["total_tasks"] == 6


def test_admin_approvals_role_filtering(client, admin_auth, hr_auth, candidate_auth, monkeypatch):
    """Verifies that admin pending approvals supports the ?role= query parameter."""
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")
    admin_headers, _ = admin_auth
    hr_headers, _ = hr_auth
    cand_headers, _ = candidate_auth

    # 1. Create a senior job (policy routes senior step 1 to director)
    job_res = client.post(
        "/jobs/",
        json={"title": "Senior Distributed Engineer", "description": "Go & consensus", "role_tier": "senior"},
        headers=hr_headers,
    )
    job_id = job_res.json()["id"]

    upload_res = client.post(
        "/upload-resume",
        files={"file": ("senior_cv.txt", b"Experienced in distributed systems.", "text/plain")},
        headers=cand_headers,
    )
    assert upload_res.status_code == 201

    match_res = client.post(
        f"/jobs/{job_id}/matches",
        json={"top_k": 5, "min_score": 0.0},
        headers=hr_headers,
    )
    assert match_res.status_code == 200
    app_id = match_res.json()["matches"][0]["application"]["id"]

    # Submit for approval -> routes to director
    submit_res = client.post(f"/candidates/applications/{app_id}/submit-for-approval", headers=hr_headers)
    assert submit_res.status_code == 200
    assert submit_res.json()["current_approval"]["approver_role"] == "director"

    # Query for director
    resp_dir = client.get("/approvals/pending?role=director", headers=admin_headers)
    assert resp_dir.status_code == 200
    dir_list = resp_dir.json()
    assert any(a["approver_role"] == "director" for a in dir_list)
    assert all(a["approver_role"] == "director" for a in dir_list)

    # Query for hiring_manager
    resp_hm = client.get("/approvals/pending?role=hiring_manager", headers=admin_headers)
    assert resp_hm.status_code == 200
    hm_list = resp_hm.json()
    assert all(a["approver_role"] == "hiring_manager" for a in hm_list)
