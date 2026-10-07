import os
import app.routers.resumes as resumes_router


def test_upload_resume_mock_extraction_enabled(client, candidate_auth, monkeypatch):
    """When MOCK_EXTRACTION is true, candidate is saved with raw_text, parsed_data."""
    monkeypatch.setenv("MOCK_EXTRACTION", "true")
    headers, _ = candidate_auth

    resume_text = "Jane Doe\nSenior Python Engineer\nSkills: Python, FastAPI, Docker"
    response = client.post(
        "/upload-resume",
        files={"file": ("jane_doe.txt", resume_text.encode("utf-8"), "text/plain")},
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert "candidate_id" in data
    assert data["filename"] == "jane_doe.txt"
    assert data["status"] == "parsed"
    assert "Resume uploaded and parsed successfully" in data["message"]

    # Verify candidate record in DB
    candidate_res = client.get(f"/candidates/{data['candidate_id']}", headers=headers)
    assert candidate_res.status_code == 200
    candidate = candidate_res.json()
    assert candidate["raw_resume_filename"] == "jane_doe.txt"
    assert candidate["raw_text"] == resume_text
    # Name and email are not in the extraction model schema (handled separately)
    assert candidate["name"] is None
    assert candidate["email"] is None

    # Verify parsed_data conforms to integration contract
    parsed = candidate["parsed_data"]
    assert parsed is not None
    assert parsed["current_title"] == "Senior Backend Engineer"
    assert parsed["seniority"] == "senior"
    assert parsed["years_experience"] == 5.5
    assert "Python" in parsed["core_skills"]
    assert "Docker" in parsed["secondary_skills"]
    assert parsed["leadership_experience"] is True
    assert "name" not in parsed
    assert "email" not in parsed
    assert "phone" not in parsed

    # Verify file saved to disk
    files_on_disk = os.listdir(resumes_router.UPLOAD_DIR)
    assert len(files_on_disk) == 1
    assert files_on_disk[0].endswith(".txt")


def test_upload_resume_mock_extraction_disabled(client, candidate_auth, monkeypatch):
    """When MOCK_EXTRACTION is false, raw_text is saved, but parsed_data=None."""
    monkeypatch.setenv("MOCK_EXTRACTION", "false")
    headers, _ = candidate_auth

    resume_text = "Raw plain text resume content for ingestion testing"
    response = client.post(
        "/upload-resume",
        files={"file": ("unparsed_cv.txt", resume_text.encode("utf-8"), "text/plain")},
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "uploaded"
    assert "Extraction model not yet wired in" in data["message"]

    candidate_res = client.get(f"/candidates/{data['candidate_id']}", headers=headers)
    assert candidate_res.status_code == 200
    candidate = candidate_res.json()
    # raw_text is populated regardless of whether extraction runs
    assert candidate["raw_text"] == resume_text
    assert candidate["parsed_data"] is None
    assert candidate["name"] is None


def test_upload_resume_sets_user_id(client, candidate_auth):
    """Ensures the uploaded resume's candidate record is linked to the authenticated user."""
    headers, user_data = candidate_auth

    response = client.post(
        "/upload-resume",
        files={"file": ("cv.txt", b"simple text resume", "text/plain")},
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()

    candidate_res = client.get(f"/candidates/{data['candidate_id']}", headers=headers)
    assert candidate_res.json()["user_id"] == user_data["id"]


def test_upload_resume_disallowed_extension(client, candidate_auth):
    headers, _ = candidate_auth
    response = client.post(
        "/upload-resume",
        files={"file": ("exploit.exe", b"binary content", "application/octet-stream")},
        headers=headers,
    )
    assert response.status_code == 400
    assert "Unsupported file extension" in response.json()["detail"]

    # Verify no file was saved to disk
    assert len(os.listdir(resumes_router.UPLOAD_DIR)) == 0


def test_upload_resume_disallowed_sh_script(client, candidate_auth):
    headers, _ = candidate_auth
    response = client.post(
        "/upload-resume",
        files={"file": ("hack.sh", b"echo evil", "text/x-shellscript")},
        headers=headers,
    )
    assert response.status_code == 400
    assert "Unsupported file extension" in response.json()["detail"]


def test_upload_resume_empty_file(client, candidate_auth):
    headers, _ = candidate_auth
    response = client.post(
        "/upload-resume",
        files={"file": ("empty.txt", b"", "text/plain")},
        headers=headers,
    )
    assert response.status_code == 400
    assert "Uploaded file is empty" in response.json()["detail"]


def test_upload_resume_oversized_file(client, candidate_auth, monkeypatch):
    headers, _ = candidate_auth
    # Temporarily set max size to 100 bytes for fast testing
    monkeypatch.setattr(resumes_router, "MAX_RESUME_SIZE_BYTES", 100)
    monkeypatch.setattr(resumes_router, "MAX_RESUME_SIZE_MB", 0)

    oversized_data = b"A" * 150
    response = client.post(
        "/upload-resume",
        files={"file": ("large_resume.txt", oversized_data, "text/plain")},
        headers=headers,
    )
    assert response.status_code == 413
    assert "File size" in response.json()["detail"]


def test_upload_resume_requires_auth(client):
    """Upload without auth token should fail with 401."""
    response = client.post(
        "/upload-resume",
        files={"file": ("candidate.txt", b"text content", "text/plain")},
    )
    assert response.status_code == 401


def test_upload_resume_hr_allowed(client, hr_auth):
    """Recruiters (hr) should be able to source/upload resumes."""
    headers, _ = hr_auth
    response = client.post(
        "/upload-resume",
        files={"file": ("candidate.txt", b"text content", "text/plain")},
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert "candidate_id" in data
    assert data["status"] in ("uploaded", "parsed")


def test_upload_resume_approver_forbidden(client, approver_auth):
    """Approvers should not be able to upload resumes."""
    headers, _ = approver_auth
    response = client.post(
        "/upload-resume",
        files={"file": ("candidate.txt", b"text content", "text/plain")},
        headers=headers,
    )
    assert response.status_code == 403
