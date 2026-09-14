def test_job_matches_success(client, hr_auth, candidate_auth):
    hr_headers, _ = hr_auth
    cand_headers, _ = candidate_auth

    # 1. Create job (HR)
    job_res = client.post(
        "/jobs/",
        json={
            "title": "Senior Backend Architect",
            "description": "Design resilient Python and PostgreSQL systems.",
            "role_tier": "senior",
        },
        headers=hr_headers,
    )
    assert job_res.status_code == 201
    job_id = job_res.json()["id"]

    # 2. Upload candidate (mock extraction populates parsed_data and triggers Chroma upsert)
    upload_res = client.post(
        "/upload-resume",
        files={"file": ("alex.txt", b"Alex Mercer resume text", "text/plain")},
        headers=cand_headers,
    )
    assert upload_res.status_code == 201
    candidate_id = upload_res.json()["candidate_id"]

    # 3. Call matching endpoint (HR)
    match_res = client.post(f"/jobs/{job_id}/matches", json={"top_k": 5, "min_score": 0.0}, headers=hr_headers)
    assert match_res.status_code == 200
    data = match_res.json()
    assert data["job_id"] == job_id
    assert data["count"] == 1

    match = data["matches"][0]
    assert match["candidate"]["id"] == candidate_id
    assert match["similarity_score"] > 0.0
    assert match["similarity_percentage"] > 0.0
    assert match["rationale_source"] == "mock"

    # Verify Application record was created
    assert "application" in match
    assert match["application"]["candidate_id"] == candidate_id
    assert match["application"]["job_id"] == job_id

    # Verify LLM rationale references specific fields for defensibility
    rationale = match["rationale"]
    assert "senior" in rationale.lower()
    assert "5.5" in rationale or "5" in rationale
    assert "Python" in rationale or "FastAPI" in rationale


def test_application_created_with_shortlisted_status(client, hr_auth, candidate_auth, monkeypatch):
    """When score >= threshold, Application.status is 'shortlisted'."""
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")  # Low threshold guarantees match
    hr_headers, _ = hr_auth
    cand_headers, _ = candidate_auth

    job_res = client.post(
        "/jobs/",
        json={"title": "Data Engineer", "description": "ETL pipelines", "role_tier": "mid"},
        headers=hr_headers,
    )
    job_id = job_res.json()["id"]

    upload_res = client.post(
        "/upload-resume",
        files={"file": ("candidate.txt", b"Resume text", "text/plain")},
        headers=cand_headers,
    )
    candidate_id = upload_res.json()["candidate_id"]

    # Match
    match_res = client.post(f"/jobs/{job_id}/matches", json={"top_k": 5, "min_score": 0.0}, headers=hr_headers)
    assert match_res.status_code == 200
    data = match_res.json()
    assert len(data["matches"]) == 1
    assert data["matches"][0]["application"]["status"] == "shortlisted"


def test_duplicate_match_prevented(client, hr_auth, candidate_auth, monkeypatch):
    """Running matches twice on the same job shouldn't create duplicate Applications."""
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")
    hr_headers, _ = hr_auth
    cand_headers, _ = candidate_auth

    job_res = client.post(
        "/jobs/",
        json={"title": "DevOps", "description": "K8s management", "role_tier": "mid"},
        headers=hr_headers,
    )
    job_id = job_res.json()["id"]

    client.post(
        "/upload-resume",
        files={"file": ("cand.txt", b"Resume text", "text/plain")},
        headers=cand_headers,
    )

    # First match
    res1 = client.post(f"/jobs/{job_id}/matches", json={"top_k": 5, "min_score": 0.0}, headers=hr_headers)
    assert res1.status_code == 200
    assert res1.json()["count"] == 1

    # Second match — candidate already has an Application, should be skipped
    res2 = client.post(f"/jobs/{job_id}/matches", json={"top_k": 5, "min_score": 0.0}, headers=hr_headers)
    assert res2.status_code == 200
    assert res2.json()["count"] == 0


def test_job_matches_not_found(client, hr_auth):
    headers, _ = hr_auth
    response = client.post(
        "/jobs/00000000-0000-0000-0000-000000000000/matches",
        headers=headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found"


def test_candidate_without_parsed_data_is_not_matched(client, hr_auth, register_user, monkeypatch):
    """Upload with MOCK_EXTRACTION=false (leaves parsed_data=None) should not appear in matches."""
    monkeypatch.setenv("MOCK_EXTRACTION", "false")
    hr_headers, _ = hr_auth
    cand_headers, _ = register_user("cand_unparsed@test.com", "TestPass123!", "candidate")

    job_res = client.post(
        "/jobs/",
        json={"title": "AI Researcher", "description": "Deep learning", "role_tier": "senior"},
        headers=hr_headers,
    )
    assert job_res.status_code == 201
    job_id = job_res.json()["id"]

    upload_res = client.post(
        "/upload-resume",
        files={"file": ("unparsed.txt", b"raw text", "text/plain")},
        headers=cand_headers,
    )
    candidate_id = upload_res.json()["candidate_id"]

    cand = client.get(f"/candidates/{candidate_id}", headers=cand_headers).json()
    assert cand["parsed_data"] is None

    match_res = client.post(f"/jobs/{job_id}/matches", json={"top_k": 5, "min_score": 0.0}, headers=hr_headers)
    assert match_res.status_code == 200
    # Candidate without parsed_data should not appear in matches
    assert match_res.json()["count"] == 0


def test_candidate_patch_triggers_embedding(client, hr_auth, register_user, monkeypatch):
    """Patching parsed_data should embed the candidate and make them matchable."""
    monkeypatch.setenv("MOCK_EXTRACTION", "false")
    hr_headers, _ = hr_auth
    cand_headers, _ = register_user("cand_patch@test.com", "TestPass123!", "candidate")

    # 1. Upload unparsed candidate
    job_res = client.post("/jobs/", json={"title": "ML Engineer", "description": "PyTorch", "role_tier": "mid"}, headers=hr_headers)
    job_id = job_res.json()["id"]

    upload_res = client.post("/upload-resume", files={"file": ("cv.txt", b"cv", "text/plain")}, headers=cand_headers)
    candidate_id = upload_res.json()["candidate_id"]

    # 2. Patch candidate with structured parsed_data (simulating model output)
    parsed_payload = {
        "current_title": "ML Engineer",
        "previous_titles": ["Junior AI Developer"],
        "current_company": "DeepTech",
        "previous_companies": ["StartUp"],
        "years_experience": 3.0,
        "seniority": "mid",
        "primary_domain": "Machine Learning",
        "industries": ["AI"],
        "core_skills": ["PyTorch", "Python", "FastAPI"],
        "secondary_skills": ["Docker"],
        "tools": ["Git"],
        "leadership_experience": False,
        "key_achievements": ["Built transformer inference pipeline"],
        "location": "Remote",
        "summary": "Mid-level ML engineer with 3 years experience in PyTorch.",
    }
    patch_res = client.patch(f"/candidates/{candidate_id}", json={"parsed_data": parsed_payload}, headers=cand_headers)
    assert patch_res.status_code == 200

    # 3. Candidate is now indexed in Chroma and matchable
    monkeypatch.setenv("MATCH_SIMILARITY_THRESHOLD", "0.01")
    match_res = client.post(f"/jobs/{job_id}/matches", json={"top_k": 5, "min_score": 0.0}, headers=hr_headers)
    assert match_res.status_code == 200
    data = match_res.json()
    assert data["count"] == 1
    assert data["matches"][0]["candidate"]["id"] == candidate_id
    assert data["matches"][0]["application"]["status"] == "shortlisted"


def test_matches_requires_hr_auth(client, candidate_auth):
    """Candidates should not be able to run matches."""
    headers, _ = candidate_auth
    response = client.post("/jobs/some-id/matches", headers=headers)
    assert response.status_code == 403
