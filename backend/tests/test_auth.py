"""
Test suite for authentication: register, login, /me, role validation, error handling.
"""


def test_register_candidate_success(client):
    res = client.post("/auth/register", json={
        "email": "newcandidate@test.com",
        "password": "StrongPass1!",
        "role": "candidate",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "newcandidate@test.com"
    assert data["role"] == "candidate"
    assert data["company_id"] is None
    assert "id" in data
    assert "created_at" in data


def test_register_hr_with_company_creation(client):
    res = client.post("/auth/register", json={
        "email": "hr@newcorp.com",
        "password": "StrongPass1!",
        "role": "hr",
        "company_name": "NewCorp",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["role"] == "hr"
    assert data["company_id"] is not None


def test_register_hr_without_company_fails(client):
    res = client.post("/auth/register", json={
        "email": "hr_orphan@test.com",
        "password": "StrongPass1!",
        "role": "hr",
    })
    assert res.status_code == 400
    assert "company_name" in res.json()["detail"].lower() or "company_id" in res.json()["detail"].lower()


def test_register_approver_with_company(client, hr_auth):
    _, hr_user = hr_auth
    res = client.post("/auth/register", json={
        "email": "approver_new@test.com",
        "password": "StrongPass1!",
        "role": "approver",
        "company_id": hr_user["company_id"],
        "approver_role": "director",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["role"] == "approver"
    assert data["approver_role"] == "director"
    assert data["company_id"] == hr_user["company_id"]


def test_register_approver_without_approver_role_fails(client, hr_auth):
    _, hr_user = hr_auth
    res = client.post("/auth/register", json={
        "email": "approver_norole@test.com",
        "password": "StrongPass1!",
        "role": "approver",
        "company_id": hr_user["company_id"],
    })
    assert res.status_code == 400
    assert "approver_role" in res.json()["detail"].lower()


def test_register_duplicate_email_fails(client):
    payload = {
        "email": "dupe@test.com",
        "password": "StrongPass1!",
        "role": "candidate",
    }
    res1 = client.post("/auth/register", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/auth/register", json=payload)
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"]


def test_login_success(client):
    client.post("/auth/register", json={
        "email": "login_test@test.com",
        "password": "StrongPass1!",
        "role": "candidate",
    })
    res = client.post("/auth/login", json={
        "email": "login_test@test.com",
        "password": "StrongPass1!",
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client):
    client.post("/auth/register", json={
        "email": "wrong_pw@test.com",
        "password": "StrongPass1!",
        "role": "candidate",
    })
    res = client.post("/auth/login", json={
        "email": "wrong_pw@test.com",
        "password": "WrongPassword!",
    })
    assert res.status_code == 401
    assert "Invalid" in res.json()["detail"]


def test_login_nonexistent_user(client):
    res = client.post("/auth/login", json={
        "email": "ghost@test.com",
        "password": "StrongPass1!",
    })
    assert res.status_code == 401


def test_me_with_valid_token(client, candidate_auth):
    headers, user_data = candidate_auth
    res = client.get("/auth/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["email"] == "candidate@test.com"
    assert res.json()["id"] == user_data["id"]


def test_me_without_token(client):
    res = client.get("/auth/me")
    assert res.status_code == 401


def test_me_with_invalid_token(client):
    res = client.get("/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"})
    assert res.status_code == 401


def test_register_invalid_role(client):
    res = client.post("/auth/register", json={
        "email": "badrole@test.com",
        "password": "StrongPass1!",
        "role": "superadmin",
    })
    assert res.status_code == 422


def test_register_short_password(client):
    res = client.post("/auth/register", json={
        "email": "short@test.com",
        "password": "short",
        "role": "candidate",
    })
    assert res.status_code == 422


def test_register_and_update_name(client):
    reg = client.post("/auth/register", json={
        "email": "sam.altman@example.com",
        "password": "Password123!",
        "name": "Sam Altman",
        "role": "candidate",
    })
    assert reg.status_code == 201
    data = reg.json()
    assert data["name"] == "Sam Altman"

    login_res = client.post("/auth/login", json={
        "email": "sam.altman@example.com",
        "password": "Password123!",
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_res = client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["name"] == "Sam Altman"

    patch_res = client.patch("/auth/me", headers=headers, json={"name": "Samuel H. Altman"})
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Samuel H. Altman"


def test_update_me_cannot_escalate_role(client, register_user):
    """Users cannot escalate their role or approver tier via PATCH /auth/me."""
    headers, user = register_user("normal_user@example.com", "Password123!", "candidate")

    # Attempt to elevate to admin
    res1 = client.patch("/auth/me", headers=headers, json={"role": "admin"})
    assert res1.status_code == 403
    assert "Self-service role changes are not allowed" in res1.json()["detail"]

    # Attempt to change approver tier
    res2 = client.patch("/auth/me", headers=headers, json={"approver_role": "ceo"})
    assert res2.status_code == 403
    assert "Self-service role changes are not allowed" in res2.json()["detail"]

    # Verify role remains candidate
    me_res = client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["role"] == "candidate"


