"""
Integration tests for AI-Powered Dynamic Interview Question Generator.
"""
import uuid
import pytest
from app import models


def test_generate_interview_questions_technical(client, hr_auth, db_session):
    """Verifies generating technical coding interview questions tailored to candidate and job."""
    hr_headers, hr_user = hr_auth

    # 1. Create a candidate
    candidate = models.Candidate(
        name="Alex Rivera",
        email="alex.rivera@engineer.dev",
        raw_resume_filename="alex_rivera_cv.pdf",
        raw_text="Senior backend engineer with 8 years building distributed microservices in Go, Python, and PostgreSQL. Built event-driven ingestion pipelines handling 50k req/sec.",
        parsed_status="parsed",
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    # 2. Create a job
    job = models.Job(
        title="Staff Backend Engineer",
        description="Lead architectural strategy, high-throughput stream processing, and distributed microservice reliability. Requirements: Expertise in Go, Python, Kubernetes, Kafka, and low-latency storage systems.",
        role_tier="senior",
        company_id=hr_user["company_id"],
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    # 3. Generate questions for technical round
    payload = {
        "candidate_id": candidate.id,
        "job_id": job.id,
        "round_type": "technical",
    }
    resp = client.post("/interviews/generate-questions", json=payload, headers=hr_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["candidate_id"] == candidate.id
    assert data["round_type"] == "technical"
    assert data["total_questions"] >= 3
    assert len(data["questions"]) == data["total_questions"]

    for q in data["questions"]:
        assert q["id"]
        assert q["category"]
        assert q["question"]
        assert q["what_to_look_for"]
        assert q["suggested_dimension"]
        assert q["difficulty"]


def test_generate_interview_questions_system_design(client, hr_auth, db_session):
    """Verifies generating system design round questions."""
    hr_headers, hr_user = hr_auth

    candidate = models.Candidate(
        name="Jordan Lee",
        email="jordan.lee@staff.io",
        raw_resume_filename="jordan_resume.pdf",
        raw_text="Staff Systems Architect with extensive experience designing multi-region fault tolerance, zero-downtime migrations, and leading cross-functional engineering teams.",
        parsed_status="parsed",
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    resp_sd = client.post(
        "/interviews/generate-questions",
        json={"candidate_id": candidate.id, "round_type": "system_design"},
        headers=hr_headers,
    )
    assert resp_sd.status_code == 200, resp_sd.text
    data_sd = resp_sd.json()
    assert data_sd["round_type"] == "system_design"
    assert data_sd["total_questions"] >= 3
    assert any("system_design" in q["suggested_dimension"] for q in data_sd["questions"])


def test_generate_interview_questions_behavioral(client, hr_auth, db_session):
    """Verifies generating behavioral round questions."""
    hr_headers, hr_user = hr_auth

    candidate = models.Candidate(
        name="Morgan Taylor",
        email="morgan.taylor@lead.io",
        raw_resume_filename="morgan_resume.pdf",
        raw_text="Engineering Manager with 10 years experience leading distributed teams, mentoring junior engineers, and driving cross-team consensus.",
        parsed_status="parsed",
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    resp_beh = client.post(
        "/interviews/generate-questions",
        json={"candidate_id": candidate.id, "round_type": "behavioral"},
        headers=hr_headers,
    )
    assert resp_beh.status_code == 200, resp_beh.text
    data_beh = resp_beh.json()
    assert data_beh["round_type"] == "behavioral"
    assert data_beh["total_questions"] >= 3
    assert any(
        q["suggested_dimension"] in ["cultural_alignment", "communication", "role_fit"]
        for q in data_beh["questions"]
    )


def test_generate_interview_questions_with_custom_focus(client, hr_auth, db_session):
    """Verifies that custom focus string is accepted and reflected in generated output."""
    hr_headers, hr_user = hr_auth

    candidate = models.Candidate(
        name="Devon Patel",
        email="devon.patel@eng.io",
        raw_resume_filename="devon.pdf",
        raw_text="Cloud infrastructure engineer specializing in Kafka clustering and stateful distributed sets.",
        parsed_status="parsed",
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    custom_focus = "Kafka rebalancing and partitioned dead-letter queue recovery"
    payload = {
        "candidate_id": candidate.id,
        "round_type": "technical",
        "custom_focus": custom_focus,
    }
    resp = client.post("/interviews/generate-questions", json=payload, headers=hr_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total_questions"] >= 3
    assert any("Kafka" in q["question"] or "Kafka" in q["category"] for q in data["questions"])


def test_generate_interview_questions_auto_resolves_job_from_application(client, hr_auth, db_session):
    """Verifies that job_id is automatically resolved from candidate's active application if omitted."""
    hr_headers, hr_user = hr_auth

    candidate = models.Candidate(
        name="Samantha Fox",
        email="samantha.fox@tech.org",
        raw_resume_filename="sam.pdf",
        raw_text="Full-stack engineer with React, TypeScript, and FastAPI experience.",
        parsed_status="parsed",
    )
    job = models.Job(
        title="Full Stack Tech Lead",
        description="Lead frontend and backend integration using React, TypeScript, and FastAPI.",
        role_tier="mid",
        company_id=hr_user["company_id"],
    )
    db_session.add(candidate)
    db_session.add(job)
    db_session.commit()
    db_session.refresh(candidate)
    db_session.refresh(job)

    # Link through application
    app_record = models.Application(
        candidate_id=candidate.id,
        job_id=job.id,
        status="interviewing",
    )
    db_session.add(app_record)
    db_session.commit()

    # Omit job_id from request payload
    resp = client.post(
        "/interviews/generate-questions",
        json={"candidate_id": candidate.id, "round_type": "screening"},
        headers=hr_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["round_type"] == "screening"
    assert data["total_questions"] >= 2


def test_generate_interview_questions_candidate_not_found(client, hr_auth):
    """Verifies 404 is returned when candidate does not exist."""
    hr_headers, _ = hr_auth
    fake_id = str(uuid.uuid4())
    resp = client.post(
        "/interviews/generate-questions",
        json={"candidate_id": fake_id, "round_type": "technical"},
        headers=hr_headers,
    )
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_generate_interview_questions_forbidden_role(client, candidate_auth, db_session):
    """Verifies that non-recruiter/approver roles cannot generate interview questions."""
    cand_headers, cand_user = candidate_auth

    candidate = models.Candidate(
        name="Test Candidate",
        email="test.cand@example.com",
        raw_resume_filename="test_candidate.pdf",
        parsed_status="parsed",
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    resp = client.post(
        "/interviews/generate-questions",
        json={"candidate_id": candidate.id, "round_type": "technical"},
        headers=cand_headers,
    )
    assert resp.status_code == 403
