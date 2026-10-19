"""
Automated tests for Package A:
1. Notifications Unread Count (GET /notifications/unread-count)
2. Candidate Collaboration Notes & Chronological Audit Timeline (POST /candidates/{id}/notes, GET /candidates/{id}/timeline, DELETE /candidates/{id}/notes/{note_id})
3. Executive Hiring Packet Export & Download (GET /candidates/{id}/hiring-packet, GET /candidates/{id}/hiring-packet/download)
"""
import pytest
from app.models import Notification, Candidate


def test_notifications_unread_count(client, hr_auth, db_session):
    hr_headers, hr_user = hr_auth
    user_id = hr_user["id"]

    # Initial check
    res = client.get("/notifications/unread-count", headers=hr_headers)
    assert res.status_code == 200
    data = res.json()
    assert "unread_count" in data
    initial_unread = data["unread_count"]

    # Create an unread notification directly in DB with is_read=False
    notif = Notification(
        user_id=user_id,
        recipient_email=hr_user["email"],
        subject="Test Notification",
        body_text="This is a test notification for unread count badge",
        notification_type="general",
        is_read=False,
    )
    db_session.add(notif)
    db_session.commit()

    # Re-check unread count
    res2 = client.get("/notifications/unread-count", headers=hr_headers)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["unread_count"] == initial_unread + 1


def test_candidate_notes_and_timeline_lifecycle(client, hr_auth, candidate_auth):
    hr_headers, hr_user = hr_auth
    cand_headers, _ = candidate_auth

    # 1. Upload a resume to create a candidate
    upload_res = client.post(
        "/upload-resume",
        files={"file": ("dossier_cv.txt", b"Jane Doe - Staff Systems Engineer with 10 years experience in Go and Rust", "text/plain")},
        headers=cand_headers,
    )
    assert upload_res.status_code == 201
    candidate_id = upload_res.json()["candidate_id"]

    # 2. Get initial timeline
    tl_res = client.get(f"/candidates/{candidate_id}/timeline", headers=hr_headers)
    assert tl_res.status_code == 200
    tl_data = tl_res.json()
    assert tl_data["candidate_id"] == candidate_id
    assert len(tl_data["events"]) >= 1
    # Check that resume_uploaded event is present
    event_types = [e["event_type"] for e in tl_data["events"]]
    assert "resume_uploaded" in event_types
    assert len(tl_data["notes"]) == 0

    # 3. Add an internal collaboration note
    note_payload = {
        "content": "Candidate demonstrated deep knowledge of distributed consensus and Raft in initial phone screen."
    }
    note_res = client.post(
        f"/candidates/{candidate_id}/notes",
        json=note_payload,
        headers=hr_headers,
    )
    assert note_res.status_code == 201
    note_data = note_res.json()
    assert note_data["candidate_id"] == candidate_id
    assert note_data["content"] == note_payload["content"]
    assert note_data["author_name"] == (hr_user.get("name") or hr_user["email"])
    note_id = note_data["id"]

    # 4. Re-fetch timeline: verify note is present both in notes list and in chronological events stream
    tl_res2 = client.get(f"/candidates/{candidate_id}/timeline", headers=hr_headers)
    assert tl_res2.status_code == 200
    tl_data2 = tl_res2.json()
    assert len(tl_data2["notes"]) == 1
    assert tl_data2["notes"][0]["id"] == note_id

    note_events = [e for e in tl_data2["events"] if e["event_type"] == "note_added"]
    assert len(note_events) == 1
    assert note_events[0]["metadata"]["note_id"] == note_id
    assert "Raft" in note_events[0]["description"]

    # 5. Delete note
    del_res = client.delete(f"/candidates/{candidate_id}/notes/{note_id}", headers=hr_headers)
    assert del_res.status_code == 204

    # 6. Verify note was removed
    tl_res3 = client.get(f"/candidates/{candidate_id}/timeline", headers=hr_headers)
    assert tl_res3.status_code == 200
    assert len(tl_res3.json()["notes"]) == 0
    assert not any(e["event_type"] == "note_added" for e in tl_res3.json()["events"])


def test_executive_hiring_packet_export_and_download(client, hr_auth, candidate_auth):
    hr_headers, _ = hr_auth
    cand_headers, _ = candidate_auth

    # 1. Create Job and upload candidate
    job_res = client.post(
        "/jobs/",
        json={"title": "Principal Architect", "description": "High scale architecture", "role_tier": "senior"},
        headers=hr_headers,
    )
    assert job_res.status_code == 201
    job_id = job_res.json()["id"]

    upload_res = client.post(
        "/upload-resume",
        files={"file": ("packet_cv.txt", b"Alice Smith - Cloud and Distributed Systems Specialist", "text/plain")},
        headers=cand_headers,
    )
    assert upload_res.status_code == 201
    candidate_id = upload_res.json()["candidate_id"]

    # 2. Add a team note
    note_res = client.post(
        f"/candidates/{candidate_id}/notes",
        json={"content": "Strong culture fit; recommended by senior architect."},
        headers=hr_headers,
    )
    assert note_res.status_code == 201

    # 3. GET hiring packet JSON/Markdown
    packet_res = client.get(f"/candidates/{candidate_id}/hiring-packet", headers=hr_headers)
    assert packet_res.status_code == 200
    packet_data = packet_res.json()
    assert packet_data["candidate_id"] == candidate_id
    assert "markdown" in packet_data
    markdown = packet_data["markdown"]
    assert "# Executive Hiring Dossier:" in markdown
    assert "## 1. Executive Candidate Profile & Qualifications" in markdown
    assert "## 7. Internal Team Collaboration Notes" in markdown
    assert "Strong culture fit" in markdown

    # 4. Download packet endpoint
    dl_res = client.get(f"/candidates/{candidate_id}/hiring-packet/download", headers=hr_headers)
    assert dl_res.status_code == 200
    assert "text/markdown" in dl_res.headers.get("content-type", "")
    assert "attachment; filename=" in dl_res.headers.get("content-disposition", "")
    assert b"# Executive Hiring Dossier:" in dl_res.content
    assert b"Strong culture fit" in dl_res.content


def test_hiring_packet_unknown_company_and_location_no_phone_fallback(client, hr_auth, db_session):
    """Verifies unknown company shows 'Not specified' (not 'Independent') and location shows 'Not specified' without phone fallback."""
    hr_headers, hr_user = hr_auth

    candidate = Candidate(
        name="Morgan Kelly",
        email="morgan.kelly@example.com",
        phone="1-800-555-9999",
        raw_resume_filename="morgan_cv.pdf",
        parsed_data={
            "current_title": "Site Reliability Engineer",
            "current_company": None,
            "location": None,
            "seniority": None,
            "years_experience": None,
            "core_skills": None,
            "secondary_skills": None,
            "tools": None,
            "key_achievements": None,
        },
        parsed_status="parsed",
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    packet_res = client.get(f"/candidates/{candidate.id}/hiring-packet", headers=hr_headers)
    assert packet_res.status_code == 200
    markdown = packet_res.json()["markdown"]

    assert "Current Organization:** Not specified" in markdown
    assert "Independent" not in markdown
    assert "Location:** Not specified" in markdown
    assert "1-800-555-9999" not in markdown
    assert "Total Experience:** Not specified" in markdown
    assert "Role Designation:** Site Reliability Engineer (Not specified)" in markdown
    assert "MID" not in markdown
    assert "Engineering Toolchain & Frameworks:** Not specified" in markdown
    assert "Standard toolchain" not in markdown


