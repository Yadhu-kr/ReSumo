def test_create_job_success(client, hr_auth):
    headers, _ = hr_auth
    payload = {
        "title": "Senior Python Backend Engineer",
        "description": "Design and build high-throughput microservices using FastAPI and Postgres.",
        "role_tier": "senior",
    }
    response = client.post("/jobs/", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == payload["title"]
    assert data["description"] == payload["description"]
    assert data["role_tier"] == "senior"
    assert data["company_id"] is not None
    assert "id" in data
    assert "created_at" in data


def test_create_job_default_role_tier(client, hr_auth):
    headers, _ = hr_auth
    payload = {
        "title": "Junior Developer",
        "description": "Assist with backend features and API integration tests.",
    }
    response = client.post("/jobs/", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["role_tier"] == "junior"


def test_create_job_invalid_role_tier(client, hr_auth):
    headers, _ = hr_auth
    payload = {
        "title": "Intern",
        "description": "General engineering support",
        "role_tier": "internship_invalid",
    }
    response = client.post("/jobs/", json=payload, headers=headers)
    assert response.status_code == 422


def test_create_job_requires_auth(client):
    response = client.post("/jobs/", json={"title": "Test", "description": "Desc"})
    assert response.status_code == 401


def test_create_job_candidate_forbidden(client, candidate_auth):
    headers, _ = candidate_auth
    response = client.post("/jobs/", json={"title": "Test", "description": "Desc"}, headers=headers)
    assert response.status_code == 403


def test_list_jobs_empty(client, hr_auth):
    headers, _ = hr_auth
    response = client.get("/jobs/", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


def test_list_jobs_ordering(client, hr_auth):
    headers, _ = hr_auth
    client.post("/jobs/", json={"title": "Job 1", "description": "Desc 1", "role_tier": "junior"}, headers=headers)
    client.post("/jobs/", json={"title": "Job 2", "description": "Desc 2", "role_tier": "mid"}, headers=headers)

    response = client.get("/jobs/", headers=headers)
    assert response.status_code == 200
    jobs = response.json()
    assert len(jobs) == 2
    assert jobs[0]["title"] == "Job 2"  # ordered by created_at desc
    assert jobs[1]["title"] == "Job 1"


def test_get_job_by_id_success(client, hr_auth):
    headers, _ = hr_auth
    create_res = client.post("/jobs/", json={"title": "AI Researcher", "description": "NLP tasks"}, headers=headers)
    job_id = create_res.json()["id"]

    response = client.get(f"/jobs/{job_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == job_id
    assert response.json()["title"] == "AI Researcher"


def test_get_job_not_found(client, hr_auth):
    headers, _ = hr_auth
    response = client.get("/jobs/00000000-0000-0000-0000-000000000000", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found"


def test_update_job_success(client, hr_auth):
    headers, _ = hr_auth
    create_res = client.post("/jobs/", json={"title": "Dev", "description": "Old desc", "role_tier": "junior"}, headers=headers)
    job_id = create_res.json()["id"]

    update_payload = {
        "title": "Lead Dev",
        "description": "New updated desc",
        "role_tier": "senior",
    }
    update_res = client.put(f"/jobs/{job_id}", json=update_payload, headers=headers)
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["title"] == "Lead Dev"
    assert data["description"] == "New updated desc"
    assert data["role_tier"] == "senior"


def test_update_job_partial(client, hr_auth):
    headers, _ = hr_auth
    create_res = client.post("/jobs/", json={"title": "Initial Title", "description": "Initial Desc", "role_tier": "mid"}, headers=headers)
    job_id = create_res.json()["id"]

    update_res = client.put(f"/jobs/{job_id}", json={"title": "Updated Title Only"}, headers=headers)
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["title"] == "Updated Title Only"
    assert data["description"] == "Initial Desc"
    assert data["role_tier"] == "mid"


def test_update_job_not_found(client, hr_auth):
    headers, _ = hr_auth
    response = client.put("/jobs/non-existent-id", json={"title": "New Title"}, headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found"


def test_delete_job_success(client, hr_auth):
    headers, _ = hr_auth
    create_res = client.post("/jobs/", json={"title": "To Delete", "description": "Temp"}, headers=headers)
    job_id = create_res.json()["id"]

    del_res = client.delete(f"/jobs/{job_id}", headers=headers)
    assert del_res.status_code == 204

    get_res = client.get(f"/jobs/{job_id}", headers=headers)
    assert get_res.status_code == 404


def test_delete_job_not_found(client, hr_auth):
    headers, _ = hr_auth
    del_res = client.delete("/jobs/non-existent-id", headers=headers)
    assert del_res.status_code == 404
    assert del_res.json()["detail"] == "Job not found"


def test_create_job_auto_sets_company_id(client, hr_auth):
    """Verifies that job creation auto-sets company_id from the authenticated HR user."""
    headers, hr_user = hr_auth
    res = client.post("/jobs/", json={"title": "Auto Company", "description": "Test"}, headers=headers)
    assert res.status_code == 201
    assert res.json()["company_id"] == hr_user["company_id"]
