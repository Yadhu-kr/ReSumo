"""
Multi-tenancy isolation tests: verifies that data leaks between companies
and between users are prevented.
"""


def test_candidate_cannot_see_other_candidates_records(client, register_user):
    """A candidate cannot access another candidate's profile."""
    headers_a, _ = register_user("alice@test.com", "TestPass123!", "candidate")
    headers_b, _ = register_user("bob@test.com", "TestPass123!", "candidate")

    # Alice uploads a resume
    upload_res = client.post(
        "/upload-resume",
        files={"file": ("alice_cv.txt", b"Alice resume", "text/plain")},
        headers=headers_a,
    )
    alice_cand_id = upload_res.json()["candidate_id"]

    # Bob tries to access Alice's candidate record → 403
    res = client.get(f"/candidates/{alice_cand_id}", headers=headers_b)
    assert res.status_code == 403


def test_hr_cannot_see_other_companies_jobs(client, register_user):
    """HR from Company A cannot see Company B's jobs."""
    headers_a, _ = register_user("hr_a@test.com", "TestPass123!", "hr", company_name="CompanyA")
    headers_b, _ = register_user("hr_b@test.com", "TestPass123!", "hr", company_name="CompanyB")

    # HR A creates a job
    job_res = client.post(
        "/jobs/",
        json={"title": "A's Engineer", "description": "Company A role"},
        headers=headers_a,
    )
    job_a_id = job_res.json()["id"]

    # HR B creates a job
    client.post(
        "/jobs/",
        json={"title": "B's Engineer", "description": "Company B role"},
        headers=headers_b,
    )

    # HR A lists jobs → should only see their own
    jobs_a = client.get("/jobs/", headers=headers_a).json()
    assert all(j["id"] != job_res.json()["id"] or True for j in jobs_a)
    assert len(jobs_a) == 1
    assert jobs_a[0]["title"] == "A's Engineer"

    # HR B lists jobs → should only see their own
    jobs_b = client.get("/jobs/", headers=headers_b).json()
    assert len(jobs_b) == 1
    assert jobs_b[0]["title"] == "B's Engineer"

    # HR B tries to access Company A's job by ID → 403
    res = client.get(f"/jobs/{job_a_id}", headers=headers_b)
    assert res.status_code == 403


def test_hr_cannot_see_other_companies_candidates(client, register_user, monkeypatch):
    """HR from Company A cannot see candidates matched to Company B's jobs."""
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")

    headers_a, _ = register_user("hra@iso.com", "TestPass123!", "hr", company_name="IsoCorpA")
    headers_b, _ = register_user("hrb@iso.com", "TestPass123!", "hr", company_name="IsoCorpB")
    cand_headers, _ = register_user("cand@iso.com", "TestPass123!", "candidate")

    # Create jobs in both companies
    job_a = client.post("/jobs/", json={"title": "A Role", "description": "Desc"}, headers=headers_a)
    job_a_id = job_a.json()["id"]

    # Candidate uploads resume
    client.post(
        "/upload-resume",
        files={"file": ("iso_cv.txt", b"Resume for isolation test", "text/plain")},
        headers=cand_headers,
    )

    # HR A runs matching → creates Application linked to Company A's job
    match_res = client.post(f"/jobs/{job_a_id}/matches", json={"top_k": 5, "min_score": 0.0}, headers=headers_a)
    assert match_res.json()["count"] == 1

    # HR A should see the candidate (has application to their company's job)
    cands_a = client.get("/candidates/", headers=headers_a).json()
    assert len(cands_a) == 1

    # HR B should NOT see this candidate (no application to Company B's jobs)
    cands_b = client.get("/candidates/", headers=headers_b).json()
    assert len(cands_b) == 0


def test_approver_only_sees_own_company_pending(client, register_user, monkeypatch):
    """An approver from Company A doesn't see Company B's pending approvals."""
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")

    # Setup two companies with HR and approvers
    hr_a, user_a = register_user("hr_pend_a@test.com", "TestPass123!", "hr", company_name="PendCorpA")
    hr_b, user_b = register_user("hr_pend_b@test.com", "TestPass123!", "hr", company_name="PendCorpB")

    approver_a, _ = register_user(
        "app_a@test.com", "TestPass123!", "approver",
        company_id=user_a["company_id"], approver_role="hiring_manager",
    )
    approver_b, _ = register_user(
        "app_b@test.com", "TestPass123!", "approver",
        company_id=user_b["company_id"], approver_role="hiring_manager",
    )

    # Candidate + upload
    cand_headers, _ = register_user("cand_pend@test.com", "TestPass123!", "candidate")
    client.post(
        "/upload-resume",
        files={"file": ("pend_cv.txt", b"Resume text", "text/plain")},
        headers=cand_headers,
    )

    # HR A creates job, matches, and submits for approval
    job_a = client.post("/jobs/", json={"title": "A Job", "description": "Desc", "role_tier": "junior"}, headers=hr_a)
    match_res = client.post(
        f"/jobs/{job_a.json()['id']}/matches",
        json={"top_k": 5, "min_score": 0.0},
        headers=hr_a,
    )
    app_id = match_res.json()["matches"][0]["application"]["id"]

    submit_res = client.post(
        f"/candidates/applications/{app_id}/submit-for-approval",
        headers=hr_a,
    )
    assert submit_res.status_code == 200

    # Approver A should see the pending approval
    pending_a = client.get("/approvals/pending", headers=approver_a).json()
    assert len(pending_a) == 1

    # Approver B should NOT see it (different company)
    pending_b = client.get("/approvals/pending", headers=approver_b).json()
    assert len(pending_b) == 0


def test_hr_cannot_delete_other_company_job(client, register_user):
    """HR from Company A cannot delete Company B's job."""
    headers_a, _ = register_user("del_a@test.com", "TestPass123!", "hr", company_name="DelCorpA")
    headers_b, _ = register_user("del_b@test.com", "TestPass123!", "hr", company_name="DelCorpB")

    job_a = client.post("/jobs/", json={"title": "A Private Job", "description": "Private"}, headers=headers_a)
    job_a_id = job_a.json()["id"]

    # HR B tries to delete Company A's job → 403
    del_res = client.delete(f"/jobs/{job_a_id}", headers=headers_b)
    assert del_res.status_code == 403

    # Verify job still exists for HR A
    get_res = client.get(f"/jobs/{job_a_id}", headers=headers_a)
    assert get_res.status_code == 200


def test_hr_cannot_match_other_company_job(client, register_user):
    """HR from Company A cannot run matches on Company B's job."""
    headers_a, _ = register_user("match_a@test.com", "TestPass123!", "hr", company_name="MatchCorpA")
    headers_b, _ = register_user("match_b@test.com", "TestPass123!", "hr", company_name="MatchCorpB")

    job_a = client.post("/jobs/", json={"title": "A Match Job", "description": "Test"}, headers=headers_a)
    job_a_id = job_a.json()["id"]

    # HR B tries to match against Company A's job → 403
    match_res = client.post(
        f"/jobs/{job_a_id}/matches",
        json={"top_k": 5, "min_score": 0.0},
        headers=headers_b,
    )
    assert match_res.status_code == 403


def test_approver_cannot_action_other_company_approval(client, register_user, monkeypatch):
    """An approver from Company B cannot approve/reject an approval belonging to Company A."""
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")

    hr_a, user_a = register_user("hr_act_a@test.com", "TestPass123!", "hr", company_name="ActionCorpA")
    _, user_b = register_user("hr_act_b@test.com", "TestPass123!", "hr", company_name="ActionCorpB")

    approver_a, _ = register_user(
        "app_act_a@test.com", "TestPass123!", "approver",
        company_id=user_a["company_id"], approver_role="hiring_manager",
    )
    approver_b, _ = register_user(
        "app_act_b@test.com", "TestPass123!", "approver",
        company_id=user_b["company_id"], approver_role="hiring_manager",
    )

    # Candidate uploads resume
    cand_headers, _ = register_user("cand_act@test.com", "TestPass123!", "candidate")
    client.post(
        "/upload-resume",
        files={"file": ("act_cv.txt", b"Resume text", "text/plain")},
        headers=cand_headers,
    )

    # HR A creates junior job, matches, and submits for approval
    job_a = client.post("/jobs/", json={"title": "A Role", "description": "Desc", "role_tier": "junior"}, headers=hr_a)
    match_res = client.post(
        f"/jobs/{job_a.json()['id']}/matches",
        json={"top_k": 5, "min_score": 0.0},
        headers=hr_a,
    )
    app_id = match_res.json()["matches"][0]["application"]["id"]

    submit_res = client.post(
        f"/candidates/applications/{app_id}/submit-for-approval",
        headers=hr_a,
    )
    approval_id = submit_res.json()["current_approval"]["id"]

    # Approver B (different company) tries to action Company A's approval -> 403
    action_res_b = client.post(
        f"/approvals/{approval_id}/action",
        json={"action": "approve", "notes": "Malicious cross-company approval"},
        headers=approver_b,
    )
    assert action_res_b.status_code == 403
    assert "Access denied: approver cannot act on approvals for another company" in action_res_b.json()["detail"]

    # Approver A (same company) can successfully approve
    action_res_a = client.post(
        f"/approvals/{approval_id}/action",
        json={"action": "approve", "notes": "Legitimate approval"},
        headers=approver_a,
    )
    assert action_res_a.status_code == 200
    assert action_res_a.json()["action"] == "approved"


def test_user_cannot_view_other_company_application_approvals(client, register_user, monkeypatch):
    """Users from Company B cannot inspect historical/pending approvals for Company A's applications."""
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")

    hr_a, user_a = register_user("hr_view_a@test.com", "TestPass123!", "hr", company_name="ViewCorpA")
    hr_b, user_b = register_user("hr_view_b@test.com", "TestPass123!", "hr", company_name="ViewCorpB")

    approver_a, _ = register_user(
        "app_view_a@test.com", "TestPass123!", "approver",
        company_id=user_a["company_id"], approver_role="hiring_manager",
    )
    approver_b, _ = register_user(
        "app_view_b@test.com", "TestPass123!", "approver",
        company_id=user_b["company_id"], approver_role="hiring_manager",
    )

    cand_headers, cand_user = register_user("cand_view@test.com", "TestPass123!", "candidate")
    up_res = client.post(
        "/upload-resume",
        files={"file": ("view_cv.txt", b"Resume text", "text/plain")},
        headers=cand_headers,
    )
    cand_id = up_res.json()["candidate_id"]

    job_a = client.post("/jobs/", json={"title": "A Role", "description": "Desc", "role_tier": "junior"}, headers=hr_a)
    match_res = client.post(
        f"/jobs/{job_a.json()['id']}/matches",
        json={"top_k": 5, "min_score": 0.0},
        headers=hr_a,
    )
    app_id = match_res.json()["matches"][0]["application"]["id"]
    client.post(f"/candidates/applications/{app_id}/submit-for-approval", headers=hr_a)

    # Approver B and HR B try to access Company A's application approvals -> 403
    res_b_app = client.get(f"/approvals/application/{app_id}", headers=approver_b)
    assert res_b_app.status_code == 403

    res_b_hr = client.get(f"/approvals/application/{app_id}", headers=hr_b)
    assert res_b_hr.status_code == 403

    # Candidate from another account tries to access -> 403
    other_cand_headers, _ = register_user("other_cand@test.com", "TestPass123!", "candidate")
    res_other_cand = client.get(f"/approvals/application/{app_id}", headers=other_cand_headers)
    assert res_other_cand.status_code == 403

    # Approver A and owning Candidate can view
    res_a = client.get(f"/approvals/application/{app_id}", headers=approver_a)
    assert res_a.status_code == 200
    assert len(res_a.json()) == 1

    res_cand = client.get(f"/approvals/application/{app_id}", headers=cand_headers)
    assert res_cand.status_code == 200
    assert len(res_cand.json()) == 1

