"""
Unit and integration tests for:
1. OCR fallback text extraction
2. Candidate contact & email extraction
3. Universal Interview Calendar (.ics generation & scheduling)
4. Transactional notifications & email logs
"""
from datetime import datetime, timezone, timedelta
from app.services.contact_extraction import extract_contact_info
from app.services.parser import extract_text, _extract_pdf_ocr


def test_contact_extraction_direct_and_obfuscated():
    """Validates regex extraction of email, phone, name, and profile URLs."""
    sample_text = (
        "Alice Smith\n"
        "Lead Fullstack Architect\n"
        "Contact: alice.smith@engineering.io | +1 (555) 234-5678\n"
        "LinkedIn: https://linkedin.com/in/alicesmith-dev\n"
        "GitHub: https://github.com/alicesmith\n"
        "Summary: Senior engineer with 10 years experience."
    )
    result = extract_contact_info(sample_text)
    assert result["name"] == "Alice Smith"
    assert result["email"] == "alice.smith@engineering.io"
    assert "555" in result["phone"]
    assert "alicesmith-dev" in result["linkedin_url"]
    assert "alicesmith" in result["github_url"]

    # Obfuscated email test
    obfuscated_text = (
        "Bob Builder\n"
        "Reach me at bob dot builder [at] company [dot] com\n"
        "Phone: 415-889-1234\n"
    )
    obf_result = extract_contact_info(obfuscated_text)
    assert obf_result["name"] == "Bob Builder"
    assert obf_result["email"] == "bob.builder@company.com"
    assert "415" in obf_result["phone"]


def test_ocr_fallback_handling():
    """Validates that OCR functions gracefully handle files without crashing."""
    # Test with non-existent or text file returns fallback without throwing unhandled exceptions
    res = _extract_pdf_ocr("non_existent_file.pdf")
    assert res == ""


def test_interview_scheduling_and_notifications_flow(client, hr_auth, candidate_auth):
    """
    Comprehensive integration test:
    - Recruiter schedules an interview round
    - Candidate receives in-app notification
    - Download universal RFC 5545 .ics file
    - Update schedule status
    - Mark notifications as read
    """
    hr_headers, hr_user = hr_auth
    cand_headers, cand_user = candidate_auth

    # 1. Create a candidate
    upload_res = client.post(
        "/upload-resume",
        files={"file": ("candidate.txt", b"Sarah Connor\nDevOps Engineer\nEmail: sarah@skynet.com", "text/plain")},
        headers=cand_headers,
    )
    assert upload_res.status_code == 201
    cand_id = upload_res.json()["candidate_id"]

    # 2. Recruiter schedules interview
    start_time = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    sched_payload = {
        "candidate_id": cand_id,
        "title": "System Architecture Deep Dive",
        "round_type": "system_design",
        "start_time": start_time,
        "duration_minutes": 60,
        "meeting_link": "https://meet.google.com/xyz-resumo",
        "notes": "Focus on distributed queues and high-availability PostgreSQL.",
    }
    sched_res = client.post("/calendar/schedule", json=sched_payload, headers=hr_headers)
    assert sched_res.status_code == 201
    schedule = sched_res.json()
    sched_id = schedule["id"]
    assert schedule["title"] == "System Architecture Deep Dive"
    assert schedule["duration_minutes"] == 60
    assert schedule["status"] == "scheduled"
    assert schedule["meeting_link"] == "https://meet.google.com/xyz-resumo"

    # 3. Check candidate schedules
    cand_scheds = client.get(f"/calendar/candidate/{cand_id}", headers=cand_headers)
    assert cand_scheds.status_code == 200
    assert len(cand_scheds.json()) >= 1

    # 4. Download RFC 5545 universal .ics invite
    ics_res = client.get(f"/calendar/schedules/{sched_id}/ics", headers=cand_headers)
    assert ics_res.status_code == 200
    assert ics_res.headers["content-type"].startswith("text/calendar")
    ics_text = ics_res.text
    assert "BEGIN:VCALENDAR" in ics_text
    assert "BEGIN:VEVENT" in ics_text
    assert "System Architecture Deep Dive" in ics_text
    assert "https://meet.google.com/xyz-resumo" in ics_text
    assert "END:VEVENT" in ics_text
    assert "END:VCALENDAR" in ics_text

    # 5. Check notification feed for candidate
    notifs_res = client.get("/notifications/me", headers=cand_headers)
    assert notifs_res.status_code == 200
    notifs = notifs_res.json()
    assert len(notifs) >= 1
    sched_notif = next((n for n in notifs if n["reference_id"] == sched_id), None)
    assert sched_notif is not None
    assert "Interview Confirmed" in sched_notif["subject"]
    assert sched_notif["is_read"] is False

    # 6. Mark notification as read
    read_res = client.patch(f"/notifications/{sched_notif['id']}/read", headers=cand_headers)
    assert read_res.status_code == 200
    assert read_res.json()["is_read"] is True

    # 7. Update schedule status
    patch_res = client.patch(
        f"/calendar/schedules/{sched_id}",
        json={"status": "completed", "notes": "Candidate passed system design round with flying colors."},
        headers=hr_headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "completed"

    # 8. Mark all notifications as read
    mark_all_res = client.post("/notifications/mark-all-read", headers=cand_headers)
    assert mark_all_res.status_code == 200


def test_notifications_test_email_endpoint(client, hr_auth):
    """Verifies that recruiters can trigger transactional test email dispatch."""
    hr_headers, _ = hr_auth
    test_email_payload = {
        "recipient_email": "recruiter-alerts@test.com",
        "subject": "ReSumo Pipeline Verification",
        "message": "Testing automated email dispatch infrastructure.",
    }
    res = client.post("/notifications/test-email", json=test_email_payload, headers=hr_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["recipient_email"] == "recruiter-alerts@test.com"
    assert data["subject"] == "ReSumo Pipeline Verification"
    assert data["delivery_status"] in ("logged", "sent")


def test_offer_and_onboarding_notification_triggers(client, hr_auth, candidate_auth):
    """Verifies that extending an offer and verifying onboarding tasks generates notifications."""
    hr_headers, hr_user = hr_auth
    cand_headers, cand_user = candidate_auth

    # 1. Candidate uploads resume and creates application
    upload_res = client.post(
        "/upload-resume",
        files={"file": ("offer_cand.txt", b"David Hassel\nBackend Lead\nEmail: david@resumo.test", "text/plain")},
        headers=cand_headers,
    )
    assert upload_res.status_code == 201
    cand_id = upload_res.json()["candidate_id"]

    # Create Job
    job_res = client.post(
        "/jobs",
        json={"title": "Principal Architect", "description": "High throughput systems", "role_tier": "senior"},
        headers=hr_headers,
    )
    assert job_res.status_code == 201
    job_id = job_res.json()["id"]

    # Apply
    apply_res = client.post(f"/jobs/{job_id}/apply", headers=cand_headers)
    assert apply_res.status_code == 201
    app_id = apply_res.json()["id"]

    # Advance application to approved prior to offer generation
    app_patch = client.patch(
        f"/candidates/applications/{app_id}/status",
        json={"status": "approved"},
        headers=hr_headers,
    )
    assert app_patch.status_code == 200

    # Generate and send offer
    offer_gen = client.post(
        "/offers/generate",
        json={
            "application_id": app_id,
            "salary": 180000.0,
            "currency": "USD",
            "start_date": "2026-11-01",
            "role_title": "Principal Architect",
        },
        headers=hr_headers,
    )
    assert offer_gen.status_code == 201
    offer_id = offer_gen.json()["id"]

    send_res = client.post(f"/offers/{offer_id}/send", headers=hr_headers)
    assert send_res.status_code == 200

    # Verify notification in candidate feed
    notifs_res = client.get("/notifications/me", headers=cand_headers)
    assert notifs_res.status_code == 200
    offer_notif = next((n for n in notifs_res.json() if n["notification_type"] == "offer_extended"), None)
    assert offer_notif is not None
    assert "Official Offer Extended" in offer_notif["subject"]

    # Candidate can mark their own notification as read
    own_read_res = client.patch(f"/notifications/{offer_notif['id']}/read", headers=cand_headers)
    assert own_read_res.status_code == 200
    assert own_read_res.json()["is_read"] is True


def test_mark_notification_read_forbidden_for_other_user(client, hr_auth, candidate_auth, register_user):
    """Users cannot mark notifications belonging to other users as read."""
    hr_headers, _ = hr_auth
    cand_headers, _ = candidate_auth
    other_headers, _ = register_user("unauthorized_reader@test.com", "TestPass123!", "candidate")

    # Send a notification to candidate via HR
    res = client.post(
        "/notifications/test-email",
        json={
            "recipient_email": "candidate@test.com",
            "subject": "Private Notice",
            "message": "Confidential candidate message",
        },
        headers=hr_headers,
    )
    assert res.status_code == 200
    notif_id = res.json()["id"]

    # Unauthorized user attempts to mark as read
    unauth_res = client.patch(f"/notifications/{notif_id}/read", headers=other_headers)
    assert unauth_res.status_code == 403
    assert "Access denied" in unauth_res.json()["detail"]


