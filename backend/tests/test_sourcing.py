import io
import pytest
from app import models


def test_recruiter_clip_candidate(client, hr_auth):
    hr_headers, hr_user = hr_auth

    # Create job
    job_res = client.post(
        "/jobs/",
        headers=hr_headers,
        json={"title": "Staff AI Engineer", "description": "LLM fine-tuning and Python.", "role_tier": "senior"},
    )
    assert job_res.status_code == 201
    job_id = job_res.json()["id"]

    # Clip candidate
    clip_payload = {
        "name": "Linus Torvalds",
        "email": "linus@linuxfoundation.org",
        "phone": "+1-555-0199",
        "title": "Principal Kernel Architect",
        "company": "Linux Foundation",
        "sourcing_url": "https://github.com/torvalds",
        "skills": ["C", "Git", "Kernel Architecture", "Systems Programming"],
        "years_experience": 30,
        "summary": "Creator of Linux and Git.",
        "job_id": job_id,
        "notes": "Top tier candidate for systems architecture.",
    }

    res = client.post("/candidates/clip", headers=hr_headers, json=clip_payload)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Linus Torvalds"
    assert data["email"] == "linus@linuxfoundation.org"
    assert data["is_passive_lead"] is True
    assert data["sourcing_channel"] == "clipper"
    assert data["sourcing_status"] == "sourced"
    assert data["sourcing_url"] == "https://github.com/torvalds"
    assert "C" in data["parsed_data"].get("skills", [])


def test_bulk_resume_upload(client, hr_auth):
    hr_headers, hr_user = hr_auth

    job_res = client.post(
        "/jobs/",
        headers=hr_headers,
        json={"title": "DevOps Engineer", "description": "Kubernetes, Docker, CI/CD", "role_tier": "mid"},
    )
    assert job_res.status_code == 201
    job_id = job_res.json()["id"]

    files = [
        ("files", ("alice.txt", b"Alice Smith\nDevOps Engineer\nSkills: Kubernetes, Docker, Terraform", "text/plain")),
        ("files", ("bob.txt", b"Bob Jones\nCloud Architect\nSkills: AWS, GCP, Python", "text/plain")),
    ]

    res = client.post(f"/resumes/bulk-upload?job_id={job_id}", headers=hr_headers, files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    assert data["succeeded"] == 2
    assert len(data["results"]) == 2

    # Verify candidates created as passive leads
    prospects_res = client.get("/candidates/prospects", headers=hr_headers)
    assert prospects_res.status_code == 200
    prospects = prospects_res.json()
    assert len(prospects) >= 2
    for p in prospects:
        assert p["is_passive_lead"] is True
        assert p["sourcing_channel"] in ("bulk_upload", "clipper")


def test_claim_profile_and_activation_lifecycle(client, hr_auth):
    hr_headers, hr_user = hr_auth

    job_res = client.post(
        "/jobs/",
        headers=hr_headers,
        json={"title": "Lead Frontend Engineer", "description": "React, TypeScript, CSS", "role_tier": "senior"},
    )
    assert job_res.status_code == 201
    job_id = job_res.json()["id"]

    # Clip prospect
    clip_payload = {
        "name": "Sarah Connor",
        "email": "sarah.connor@sky.net",
        "title": "Lead UI Specialist",
        "skills": ["React", "TypeScript", "Vite"],
        "job_id": job_id,
    }
    clip_res = client.post("/candidates/clip", headers=hr_headers, json=clip_payload)
    assert clip_res.status_code == 201
    candidate_id = clip_res.json()["id"]

    # Send outreach
    outreach_payload = {
        "job_id": job_id,
        "message": "Hi Sarah, we love your open-source work and want to chat!",
    }
    outreach_res = client.post(f"/candidates/{candidate_id}/outreach", headers=hr_headers, json=outreach_payload)
    assert outreach_res.status_code == 200
    outreach_data = outreach_res.json()
    assert outreach_data["status"] == "outreach_sent"
    raw_token = outreach_data["claim_token"]
    assert raw_token is not None

    # Verify claim token (public endpoint)
    verify_res = client.get(f"/auth/claim-profile/verify?token={raw_token}")
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["is_expired"] is False
    assert verify_data["name"] == "Sarah Connor"
    assert verify_data["job_title"] == "Lead Frontend Engineer"

    # Activate profile (public endpoint)
    activate_payload = {
        "token": raw_token,
        "password": "StrongPassword123!",
        "name": "Sarah Connor Updated",
    }
    act_res = client.post("/auth/claim-profile/activate", json=activate_payload)
    assert act_res.status_code == 200
    act_data = act_res.json()
    assert "access_token" in act_data
    token = act_data["access_token"]

    # Verify candidate was converted from passive lead to active applicant
    candidate_headers = {"Authorization": f"Bearer {token}"}
    me_res = client.get("/auth/me", headers=candidate_headers)
    assert me_res.status_code == 200
    me = me_res.json()
    assert me["role"] == "candidate"
    assert me["email"] == "sarah.connor@sky.net"

    # Candidate should see their applications
    apps_res = client.get("/candidates/me/applications", headers=candidate_headers)
    assert apps_res.status_code == 200
    apps = apps_res.json()
    assert len(apps) == 1
    assert apps[0]["job_id"] == job_id
    assert apps[0]["status"] == "shortlisted"

    # Second activation attempt with the same token must fail (single-use)
    replay_res = client.post("/auth/claim-profile/activate", json=activate_payload)
    assert replay_res.status_code == 400
    assert "already been used" in replay_res.json()["detail"].lower()


def test_invalid_claim_token_rejected(client):
    verify_res = client.get("/auth/claim-profile/verify?token=invalid-token-12345")
    assert verify_res.status_code == 404

    act_res = client.post(
        "/auth/claim-profile/activate",
        json={"token": "invalid-token-12345", "password": "Password123!"},
    )
    assert act_res.status_code == 400


def test_manual_convert_prospect(client, hr_auth):
    hr_headers, _ = hr_auth

    clip_res = client.post(
        "/candidates/clip",
        headers=hr_headers,
        json={"name": "Grace Hopper", "email": "grace@navy.mil", "title": "Compiler Architect"},
    )
    assert clip_res.status_code == 201
    cand_id = clip_res.json()["id"]
    assert clip_res.json()["is_passive_lead"] is True

    # Manually convert
    convert_res = client.post(f"/candidates/{cand_id}/convert", headers=hr_headers)
    assert convert_res.status_code == 200
    assert convert_res.json()["is_passive_lead"] is False


def test_update_sourcing_status(client, hr_auth):
    hr_headers, _ = hr_auth

    clip_res = client.post(
        "/candidates/clip",
        headers=hr_headers,
        json={"name": "Ada Lovelace", "email": "ada@analytics.org", "title": "Algorithm Pioneer"},
    )
    cand_id = clip_res.json()["id"]

    patch_res = client.patch(
        f"/candidates/{cand_id}/sourcing-status",
        headers=hr_headers,
        json={"sourcing_status": "engaged"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["sourcing_status"] == "engaged"
