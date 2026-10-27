import pytest
from fastapi.testclient import TestClient


def test_interviewer_registration_and_scorecard(client: TestClient, db_session):
    # 1. Register HR first to establish company
    hr_reg = client.post("/auth/register", json={
        "email": "recruiter.jane@test.com",
        "password": "Password123!",
        "name": "HR Jane",
        "role": "hr",
        "company_name": "Acme Engineering",
    })
    assert hr_reg.status_code == 201
    company_id = hr_reg.json()["company_id"]
    hr_token = client.post("/auth/login", json={"email": "recruiter.jane@test.com", "password": "Password123!"}).json()["access_token"]
    hr_headers = {"Authorization": f"Bearer {hr_token}"}

    # 2. Register an interviewer linked to company
    reg_payload = {
        "email": "lead.interviewer@test.com",
        "password": "Password123!",
        "name": "Jane Senior Lead",
        "role": "interviewer",
        "company_id": company_id,
    }
    reg_res = client.post("/auth/register", json=reg_payload)
    assert reg_res.status_code == 201, reg_res.text
    user_data = reg_res.json()
    assert user_data["role"] == "interviewer"

    # 3. Login as Interviewer
    login_res = client.post("/auth/login", json={"email": reg_payload["email"], "password": reg_payload["password"]})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 4. Upload candidate
    from io import BytesIO
    pdf_bytes = b"%PDF-1.4 test candidate resume"
    upload_res = client.post(
        "/upload-resume",
        headers=hr_headers,
        files={"file": ("candidate_jane.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload_res.status_code == 201, upload_res.text
    cand_id = upload_res.json()["candidate_id"]

    # 5. Interviewer can view candidate
    cand_res = client.get(f"/candidates/{cand_id}", headers=headers)
    assert cand_res.status_code == 200
    assert cand_res.json()["id"] == cand_id

    # 6. Interviewer generates dynamic interview questions
    q_res = client.post(
        "/interviews/generate-questions",
        headers=headers,
        json={
            "candidate_id": cand_id,
            "round_type": "technical",
            "custom_focus": "Distributed Systems and Concurrency",
        },
    )
    assert q_res.status_code == 200
    q_data = q_res.json()
    assert len(q_data["questions"]) > 0

    # 7. Interviewer submits technical scorecard
    tech_scorecard_payload = {
        "candidate_id": cand_id,
        "interviewer_name": "Jane Senior Lead",
        "interview_type": "technical",
        "recommendation": "strong_hire",
        "overall_notes": "Outstanding grasp of distributed primitives and consensus algorithms.",
        "dimensions": [
            {"dimension": "technical_depth", "score": 4.8, "notes": "Deep knowledge of raft & paxos"},
            {"dimension": "system_design", "score": 4.5, "notes": "Solid horizontal partitioning approach"},
            {"dimension": "code_quality", "score": 4.6, "notes": "Clean idiomatic patterns"},
        ],
    }
    tech_res = client.post("/interviews/scorecards", headers=headers, json=tech_scorecard_payload)
    assert tech_res.status_code == 200
    summary = tech_res.json()
    assert summary["technical_score"] is not None
    assert summary["technical_score"] >= 4.5
    assert len(summary["technical_scores"]) == 3
    assert summary["consensus_badge"] == "Strong Consensus"

    # 8. HR submits HR scorecard
    hr_scorecard_payload = {
        "candidate_id": cand_id,
        "interviewer_name": "HR Jane",
        "interview_type": "hr",
        "recommendation": "hire",
        "overall_notes": "High empathy, great team collaboration mindset.",
        "dimensions": [
            {"dimension": "communication", "score": 4.5, "notes": "Articulate communicator"},
            {"dimension": "cultural_alignment", "score": 4.7, "notes": "Values transparency"},
            {"dimension": "role_fit", "score": 4.4, "notes": "Well aligned with staff engineering expectations"},
        ],
    }
    hr_submit_res = client.post("/interviews/scorecards", headers=hr_headers, json=hr_scorecard_payload)
    assert hr_submit_res.status_code == 200
    updated_summary = hr_submit_res.json()
    assert updated_summary["technical_score"] is not None
    assert updated_summary["hr_score"] is not None
    assert len(updated_summary["technical_scores"]) == 3
    assert len(updated_summary["hr_scores"]) == 3
    assert updated_summary["total_evaluations"] == 6
    assert updated_summary["consensus_percentage"] > 80.0


def test_admin_multi_role_governance(client: TestClient, db_session, hr_auth):
    _, hr_user = hr_auth

    # Register an admin
    client.post("/auth/register", json={
        "email": "super.admin@resumo.ai",
        "password": "Password123!",
        "name": "Super Admin",
        "role": "admin",
    })
    admin_token = client.post("/auth/login", json={"email": "super.admin@resumo.ai", "password": "Password123!"}).json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Register an approver / hiring manager
    client.post("/auth/register", json={
        "email": "hiring.mgr@resumo.ai",
        "password": "Password123!",
        "name": "Alex Hiring Mgr",
        "role": "approver",
        "company_id": hr_user["company_id"],
        "approver_role": "hiring_manager",
    })
    mgr_token = client.post("/auth/login", json={"email": "hiring.mgr@resumo.ai", "password": "Password123!"}).json()["access_token"]
    mgr_headers = {"Authorization": f"Bearer {mgr_token}"}

    # 1. Admin lists governance users
    users_res = client.get("/auth/governance/users", headers=admin_headers)
    assert users_res.status_code == 200
    users = users_res.json()
    mgr_user = next((u for u in users if u["email"] == "hiring.mgr@resumo.ai"), None)
    assert mgr_user is not None

    # 2. Non-admin blocked from governance
    forbidden_res = client.get("/auth/governance/users", headers=mgr_headers)
    assert forbidden_res.status_code == 403

    # 3. Admin assigns secondary role "interviewer" to this manager
    patch_res = client.patch(
        f"/auth/governance/users/{mgr_user['id']}/roles",
        headers=admin_headers,
        json={"secondary_roles": ["interviewer"]},
    )
    assert patch_res.status_code == 200
    updated_mgr = patch_res.json()
    assert "interviewer" in updated_mgr["secondary_roles"]


def test_admin_user_provisioning_and_account_logs(client: TestClient, db_session, hr_auth):
    _, hr_user = hr_auth
    company_id = hr_user["company_id"]

    # 1. Admin login
    client.post("/auth/register", json={
        "email": "corp.admin@resumo.ai",
        "password": "Password123!",
        "name": "Corp Admin",
        "role": "admin",
        "company_id": company_id,
    })
    admin_token = client.post("/auth/login", json={"email": "corp.admin@resumo.ai", "password": "Password123!"}).json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Admin provisions a new interviewer
    prov_payload = {
        "email": "provisioned.dev@resumo.ai",
        "password": "InitialPass123!",
        "name": "Provisioned Dev",
        "role": "interviewer",
        "secondary_roles": ["approver"],
        "approver_role": "director",
        "company_id": company_id,
    }
    create_res = client.post("/auth/governance/users", headers=admin_headers, json=prov_payload)
    assert create_res.status_code == 201, create_res.text
    created_user = create_res.json()
    assert created_user["email"] == "provisioned.dev@resumo.ai"
    assert created_user["role"] == "interviewer"
    assert "approver" in created_user["secondary_roles"]

    # 3. Duplicate creation blocked
    dup_res = client.post("/auth/governance/users", headers=admin_headers, json=prov_payload)
    assert dup_res.status_code == 409

    # 4. Verify provisioned user can log in with initial password
    login_res = client.post("/auth/login", json={"email": "provisioned.dev@resumo.ai", "password": "InitialPass123!"})
    assert login_res.status_code == 200

    # 5. Non-admin blocked from provisioning
    dev_token = login_res.json()["access_token"]
    dev_headers = {"Authorization": f"Bearer {dev_token}"}
    blocked_res = client.post("/auth/governance/users", headers=dev_headers, json={
        "email": "unauthorized@resumo.ai",
        "password": "Password123!",
        "role": "hr",
    })
    assert blocked_res.status_code == 403

    # 6. Admin resets password
    reset_res = client.post(
        f"/auth/governance/users/{created_user['id']}/reset-password",
        headers=admin_headers,
        json={"new_password": "NewSecretPass456!"},
    )
    assert reset_res.status_code == 200

    # 7. Old password fails, new password succeeds
    fail_res = client.post("/auth/login", json={"email": "provisioned.dev@resumo.ai", "password": "InitialPass123!"})
    assert fail_res.status_code == 401
    succ_res = client.post("/auth/login", json={"email": "provisioned.dev@resumo.ai", "password": "NewSecretPass456!"})
    assert succ_res.status_code == 200

    # 8. Check Account Logs
    logs_res = client.get("/auth/governance/logs", headers=admin_headers)
    assert logs_res.status_code == 200
    logs = logs_res.json()
    actions = [l["action"] for l in logs]
    assert "account_created" in actions
    assert "password_reset" in actions
    assert logs[0]["admin_id"] is not None
