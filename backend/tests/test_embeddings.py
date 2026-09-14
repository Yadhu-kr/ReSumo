import pytest
from app.services.embeddings import (
    build_candidate_embedding_text,
    build_job_embedding_text,
    get_chroma_client,
    get_candidates_collection,
    upsert_candidate_vector,
    delete_candidate_vector,
    upsert_job_vector,
    delete_job_vector,
    query_top_candidates,
)


def test_build_candidate_embedding_text_all_fields():
    data = {
        "current_title": "Lead Platform Engineer",
        "previous_titles": ["Senior Software Engineer", "DevOps Engineer"],
        "primary_domain": "Cloud Infrastructure",
        "industries": ["Fintech", "Enterprise SaaS"],
        "core_skills": ["Go", "Kubernetes", "AWS"],
        "secondary_skills": ["Python", "Terraform"],
        "tools": ["Docker", "Prometheus", "Helm"],
        "years_experience": 8.0,
        "seniority": "lead",
        "summary": "Experienced infrastructure and platform engineer building reliable cloud platforms.",
    }
    text = build_candidate_embedding_text(data)
    assert text is not None
    assert "Current Title: Lead Platform Engineer" in text
    assert "Previous Titles: Senior Software Engineer, DevOps Engineer" in text
    assert "Primary Domain: Cloud Infrastructure" in text
    assert "Industries: Fintech, Enterprise SaaS" in text
    assert "Core Skills: Go, Kubernetes, AWS" in text
    assert "Secondary Skills: Python, Terraform" in text
    assert "Tools: Docker, Prometheus, Helm" in text
    assert "Years of Experience: 8.0" in text
    assert "Seniority: lead" in text
    assert "Summary: Experienced infrastructure" in text


def test_build_candidate_embedding_text_null_or_empty():
    assert build_candidate_embedding_text(None) is None
    assert build_candidate_embedding_text({}) is None
    assert build_candidate_embedding_text({"unknown_field": "val"}) is None


def test_build_job_embedding_text():
    text = build_job_embedding_text(
        title="Senior Python Architect",
        description="Design distributed microservices.",
        role_tier="senior",
    )
    assert "Job Title: Senior Python Architect" in text
    assert "Role Tier: senior" in text
    assert "Description: Design distributed microservices." in text


def test_chroma_candidate_vector_lifecycle(tmp_path, monkeypatch):
    test_client = get_chroma_client(persist_dir=str(tmp_path / "chroma"))

    # Mock compute_embedding to return a deterministic vector
    fake_dim = 16
    monkeypatch.setattr(
        "app.services.embeddings.compute_embedding",
        lambda text: [0.25] * fake_dim,
    )

    candidate_id = "cand-123"
    parsed_data = {
        "current_title": "Backend Dev",
        "primary_domain": "Backend",
        "core_skills": ["Python", "FastAPI"],
        "years_experience": 3.0,
        "seniority": "mid",
        "summary": "Mid-level backend dev",
    }

    # Upsert
    success = upsert_candidate_vector(candidate_id, parsed_data, client=test_client)
    assert success is True

    coll = get_candidates_collection(test_client)
    assert coll.count() == 1

    # Query
    matches = query_top_candidates("Backend Python Developer", top_k=5, client=test_client)
    assert len(matches) == 1
    assert matches[0]["candidate_id"] == candidate_id
    assert matches[0]["similarity_score"] > 0.0

    # Delete
    delete_candidate_vector(candidate_id, client=test_client)
    assert coll.count() == 0
