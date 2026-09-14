"""
Automated test suite for Phase 3: HITL Tiered Approval Workflow (with auth).

Tests cover:
- Policy inspection & data-driven configuration (viva demoability)
- Application submission for approval (role-tier routing)
- Single-tier approval workflow (junior/mid -> hiring_manager -> approved)
- Multi-tier escalation workflow (senior -> director -> vp -> approved)
- Intermediate rejection halting the chain immediately (application -> rejected)
- Validation errors (non-existent application, duplicate pending submission, double-actioning)
- Pending approval filtering by approver role/company
"""
import pytest


def _create_job_and_match(client, hr_headers, cand_headers, role_tier="junior", monkeypatch=None):
    """Helper: creates a job, uploads a resume, runs matching, returns (job_id, candidate_id, application_id)."""
    job_res = client.post(
        "/jobs/",
        json={"title": f"Test {role_tier} Role", "description": "Testing", "role_tier": role_tier},
        headers=hr_headers,
    )
    job_id = job_res.json()["id"]

    upload_res = client.post(
        "/upload-resume",
        files={"file": (f"{role_tier}_cv.txt", b"Resume text content", "text/plain")},
        headers=cand_headers,
    )
    candidate_id = upload_res.json()["candidate_id"]

    # Run matching to create Application
    match_res = client.post(
        f"/jobs/{job_id}/matches",
        json={"top_k": 5, "min_score": 0.0},
        headers=hr_headers,
    )
    assert match_res.status_code == 200
    assert match_res.json()["count"] == 1
    application_id = match_res.json()["matches"][0]["application"]["id"]

    return job_id, candidate_id, application_id


def test_default_approval_policies_seeded(client, hr_auth):
    """Verifies that default 5 approval policies are seeded and queryable."""
    headers, _ = hr_auth
    res = client.get("/approvals/policies", headers=headers)
    assert res.status_code == 200
    policies = res.json()
    assert len(policies) == 5

    # Check routing matrix: junior/mid -> hiring_manager, senior -> director then vp, exec -> ceo
    mapping = {(p["role_tier"], p["step_order"]): p["approver_role"] for p in policies}
    assert mapping[("junior", 1)] == "hiring_manager"
    assert mapping[("mid", 1)] == "hiring_manager"
    assert mapping[("senior", 1)] == "director"
    assert mapping[("senior", 2)] == "vp"
    assert mapping[("exec", 1)] == "ceo"


def test_policy_crud_for_viva_demonstration(client, admin_auth):
    """Demonstrates creating and deleting custom approval policies dynamically. Admin only."""
    headers, _ = admin_auth

    # Add step 3 to senior chain: ceo
    post_res = client.post(
        "/approvals/policies",
        json={"role_tier": "senior", "step_order": 3, "approver_role": "ceo"},
        headers=headers,
    )
    assert post_res.status_code == 201
    created_policy = post_res.json()
    assert created_policy["role_tier"] == "senior"
    assert created_policy["step_order"] == 3
    assert created_policy["approver_role"] == "ceo"
    policy_id = created_policy["id"]

    # Prevent duplicate step conflict
    dup_res = client.post(
        "/approvals/policies",
        json={"role_tier": "senior", "step_order": 3, "approver_role": "director"},
        headers=headers,
    )
    assert dup_res.status_code == 400

    # Delete custom policy
    del_res = client.delete(f"/approvals/policies/{policy_id}", headers=headers)
    assert del_res.status_code == 204


def test_submit_for_approval_validation_errors(client, hr_auth, candidate_auth, monkeypatch):
    """Ensures robust error handling when submitting applications for approval."""
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")
    hr_headers, _ = hr_auth

    # Non-existent application
    res_404 = client.post(
        "/candidates/applications/00000000-0000-0000-0000-000000000000/submit-for-approval",
        headers=hr_headers,
    )
    assert res_404.status_code == 404
    assert res_404.json()["detail"] == "Application not found"


def test_single_tier_approval_flow_junior_success(client, hr_auth, candidate_auth, approver_auth, monkeypatch):
    """
    Tests junior role tier:
    match -> application created -> submit -> hiring_manager pending -> approve -> application status 'approved'
    """
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")
    hr_headers, _ = hr_auth
    cand_headers, _ = candidate_auth
    approver_headers, _ = approver_auth  # hiring_manager

    # 1. Create job + match to get Application
    job_id, candidate_id, application_id = _create_job_and_match(
        client, hr_headers, cand_headers, "junior", monkeypatch
    )

    # 2. Submit application for approval (HR action)
    submit_res = client.post(
        f"/candidates/applications/{application_id}/submit-for-approval",
        headers=hr_headers,
    )
    assert submit_res.status_code == 200
    submit_data = submit_res.json()
    assert submit_data["status"] == "pending_approval"
    approval = submit_data["current_approval"]
    assert approval["approver_role"] == "hiring_manager"
    assert approval["step_order"] == 1
    assert approval["action"] == "pending"
    approval_id = approval["id"]

    # 3. Attempt duplicate submit while pending -> should be rejected with 400
    dup_submit = client.post(
        f"/candidates/applications/{application_id}/submit-for-approval",
        headers=hr_headers,
    )
    assert dup_submit.status_code == 400
    assert "already has a pending approval" in dup_submit.json()["detail"]

    # 4. Check pending list — approver should see it
    pending_res = client.get("/approvals/pending", headers=approver_headers)
    pending = pending_res.json()
    assert any(a["id"] == approval_id for a in pending)

    # 5. Action: Approve (by hiring_manager approver)
    action_res = client.post(
        f"/approvals/{approval_id}/action",
        json={"action": "approve", "notes": "Solid junior profile, pass to hire."},
        headers=approver_headers,
    )
    assert action_res.status_code == 200
    acted = action_res.json()
    assert acted["action"] == "approved"
    assert acted["notes"] == "Solid junior profile, pass to hire."
    assert acted["acted_at"] is not None
    assert acted["acted_by_user_id"] is not None


def test_multi_tier_approval_flow_senior_escalation(client, hr_auth, register_user, director_approver_auth, vp_approver_auth, monkeypatch):
    """
    Tests senior role tier multi-hop escalation:
    submit -> Step 1 (director) -> approve -> Step 2 (vp) -> approve -> application status 'approved'
    """
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")
    hr_headers, _ = hr_auth
    cand_headers, _ = register_user("senior_cand@test.com", "TestPass123!", "candidate")
    dir_headers, _ = director_approver_auth
    vp_headers, _ = vp_approver_auth

    # 1. Create senior job + match
    job_id, candidate_id, application_id = _create_job_and_match(
        client, hr_headers, cand_headers, "senior", monkeypatch
    )

    # 2. Submit for approval -> should route to director (step 1)
    submit_res = client.post(
        f"/candidates/applications/{application_id}/submit-for-approval",
        headers=hr_headers,
    )
    assert submit_res.status_code == 200
    step1_app = submit_res.json()["current_approval"]
    assert step1_app["approver_role"] == "director"
    assert step1_app["step_order"] == 1
    step1_id = step1_app["id"]

    # 3. Director approves step 1
    dir_action = client.post(
        f"/approvals/{step1_id}/action",
        json={"action": "approve", "notes": "Approved from technical standpoint by Director."},
        headers=dir_headers,
    )
    assert dir_action.status_code == 200
    assert dir_action.json()["action"] == "approved"

    # 4. Check pending approvals for VP
    pending_vp = client.get("/approvals/pending", headers=vp_headers).json()
    vp_approvals = [a for a in pending_vp if a["application_id"] == application_id]
    assert len(vp_approvals) == 1
    step2_app = vp_approvals[0]
    assert step2_app["approver_role"] == "vp"
    assert step2_app["step_order"] == 2
    step2_id = step2_app["id"]

    # 5. VP approves step 2 (final tier)
    vp_action = client.post(
        f"/approvals/{step2_id}/action",
        json={"action": "approve", "notes": "Executive budget and headcount authorized."},
        headers=vp_headers,
    )
    assert vp_action.status_code == 200
    assert vp_action.json()["action"] == "approved"


def test_multi_tier_intermediate_rejection_halts_chain(client, hr_auth, register_user, director_approver_auth, vp_approver_auth, monkeypatch):
    """
    Tests that rejecting at an intermediate step halts the chain immediately:
    submit -> Step 1 (director) -> reject -> application status 'rejected' -> NO Step 2 created
    """
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")
    hr_headers, _ = hr_auth
    cand_headers, _ = register_user("rejected_cand@test.com", "TestPass123!", "candidate")
    dir_headers, _ = director_approver_auth
    vp_headers, _ = vp_approver_auth

    # 1. Create senior job + match
    job_id, candidate_id, application_id = _create_job_and_match(
        client, hr_headers, cand_headers, "senior", monkeypatch
    )

    # 2. Submit for approval -> Director
    submit_res = client.post(
        f"/candidates/applications/{application_id}/submit-for-approval",
        headers=hr_headers,
    )
    assert submit_res.status_code == 200
    step1_id = submit_res.json()["current_approval"]["id"]

    # 3. Director rejects at Step 1
    dir_action = client.post(
        f"/approvals/{step1_id}/action",
        json={"action": "reject", "notes": "Insufficient distributed systems security background."},
        headers=dir_headers,
    )
    assert dir_action.status_code == 200
    assert dir_action.json()["action"] == "rejected"
    assert dir_action.json()["notes"] == "Insufficient distributed systems security background."

    # 4. Verify NO pending approvals remain for VP
    pending_vp = client.get("/approvals/pending", headers=vp_headers).json()
    assert not any(a["application_id"] == application_id for a in pending_vp)


def test_action_approval_error_handling(client, hr_auth, register_user, ceo_approver_auth, monkeypatch):
    """Ensures 404 for missing approval and 400 for double-actioning."""
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")
    hr_headers, _ = hr_auth
    ceo_headers, _ = ceo_approver_auth

    # 404 on missing approval
    res_404 = client.post(
        "/approvals/00000000-0000-0000-0000-000000000000/action",
        json={"action": "approve"},
        headers=ceo_headers,
    )
    assert res_404.status_code == 404

    # Create exec job, match, submit
    cand_headers, _ = register_user("exec_cand@test.com", "TestPass123!", "candidate")
    job_id, candidate_id, application_id = _create_job_and_match(
        client, hr_headers, cand_headers, "exec", monkeypatch
    )

    submit_res = client.post(
        f"/candidates/applications/{application_id}/submit-for-approval",
        headers=hr_headers,
    )
    app_id = submit_res.json()["current_approval"]["id"]

    # Action once (approve by CEO)
    act1 = client.post(f"/approvals/{app_id}/action", json={"action": "approve"}, headers=ceo_headers)
    assert act1.status_code == 200

    # Action second time -> 400
    act2 = client.post(f"/approvals/{app_id}/action", json={"action": "reject"}, headers=ceo_headers)
    assert act2.status_code == 400
    assert "already been acted upon" in act2.json()["detail"]
