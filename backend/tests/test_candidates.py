def test_list_candidates_empty(client, hr_auth):
    headers, _ = hr_auth
    response = client.get("/candidates/", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


def test_candidate_sees_only_own_records(client, register_user):
    """A candidate can only see their own candidate records."""
    headers1, _ = register_user("cand1@test.com", "TestPass123!", "candidate")
    headers2, _ = register_user("cand2@test.com", "TestPass123!", "candidate")

    # cand1 uploads a resume
    upload_res = client.post(
        "/upload-resume",
        files={"file": ("cand1_resume.txt", b"resume text 1", "text/plain")},
        headers=headers1,
    )
    assert upload_res.status_code == 201
    cand1_id = upload_res.json()["candidate_id"]

    # cand2 uploads a resume
    client.post(
        "/upload-resume",
        files={"file": ("cand2_resume.txt", b"resume text 2", "text/plain")},
        headers=headers2,
    )

    # cand1 lists candidates — should see only their own
    list_res = client.get("/candidates/", headers=headers1)
    assert list_res.status_code == 200
    candidates = list_res.json()
    assert len(candidates) == 1
    assert candidates[0]["id"] == cand1_id


def test_get_candidate_by_id_success(client, candidate_auth):
    headers, _ = candidate_auth
    upload_res = client.post(
        "/upload-resume",
        files={"file": ("john_doe.pdf", b"sample content", "application/pdf")},
        headers=headers,
    )
    candidate_id = upload_res.json()["candidate_id"]

    get_res = client.get(f"/candidates/{candidate_id}", headers=headers)
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["id"] == candidate_id
    assert data["raw_resume_filename"] == "john_doe.pdf"
    assert data["parsed_data"] is not None
    assert "raw_text" in data


def test_get_candidate_not_found(client, candidate_auth):
    headers, _ = candidate_auth
    response = client.get("/candidates/non-existent-candidate-id", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Candidate not found"


def test_patch_candidate_parsed_data(client, candidate_auth):
    headers, _ = candidate_auth
    upload_res = client.post(
        "/upload-resume",
        files={"file": ("resume.docx", b"docx bytes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers=headers,
    )
    candidate_id = upload_res.json()["candidate_id"]

    mock_parsed_data = {
        "current_title": "ML Engineer",
        "previous_titles": ["Junior Data Scientist"],
        "current_company": "AI Labs",
        "previous_companies": ["DataCorp"],
        "years_experience": 4.0,
        "seniority": "mid",
        "primary_domain": "Machine Learning",
        "industries": ["AI/ML", "Healthcare"],
        "core_skills": ["FastAPI", "PostgreSQL", "PyTorch"],
        "secondary_skills": ["Docker", "MLflow"],
        "tools": ["Git", "Weights & Biases"],
        "leadership_experience": False,
        "key_achievements": ["Trained custom transformer model for NER"],
        "location": "Boston, MA",
        "summary": "ML Engineer with 4 years of experience building and deploying NLP models.",
    }

    patch_payload = {
        "name": "Jane Smith",
        "email": "jane.smith@example.com",
        "parsed_data": mock_parsed_data,
    }

    patch_res = client.patch(f"/candidates/{candidate_id}", json=patch_payload, headers=headers)
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["name"] == "Jane Smith"
    assert data["email"] == "jane.smith@example.com"
    assert data["parsed_data"] == mock_parsed_data


def test_patch_candidate_not_found(client, candidate_auth):
    headers, _ = candidate_auth
    response = client.patch(
        "/candidates/non-existent-candidate-id",
        json={"name": "test"},
        headers=headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Candidate not found"


def test_patch_candidate_requires_auth(client):
    response = client.patch(
        "/candidates/some-id",
        json={"name": "test"},
    )
    assert response.status_code == 401


def test_get_candidate_requires_auth(client):
    response = client.get("/candidates/some-id")
    assert response.status_code == 401
