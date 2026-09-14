import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
import app.routers.resumes as resumes_router

# In-memory SQLite engine with StaticPool so all connections share the same memory DB
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_database():
    """Creates all tables and default approval policies before each test and drops them afterwards."""
    Base.metadata.create_all(bind=engine)
    from app.routers.approvals import seed_default_policies_if_empty
    session = TestingSessionLocal()
    try:
        seed_default_policies_if_empty(session)
    finally:
        session.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    """Yields a clean SQLAlchemy session for direct DB manipulation in tests."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client():
    """FastAPI TestClient with overridden get_db dependency."""
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def temp_upload_dir(monkeypatch, tmp_path):
    """Isolates resume file uploads into a temporary directory during testing."""
    upload_dir = str(tmp_path / "resumes")
    monkeypatch.setattr(resumes_router, "UPLOAD_DIR", upload_dir)
    os.makedirs(upload_dir, exist_ok=True)
    yield upload_dir


@pytest.fixture(autouse=True)
def temp_chroma_and_mock_embeddings(monkeypatch, tmp_path):
    """
    Isolates Chroma vector storage to a temporary test directory and mocks
    compute_embedding to avoid downloading multi-gigabyte models during test runs.
    """
    import hashlib
    import math
    import app.services.embeddings as emb_service
    import app.services.llm as llm_service

    chroma_dir = str(tmp_path / "chroma")
    monkeypatch.setenv("CHROMA_DATA_DIR", chroma_dir)
    monkeypatch.setenv("MOCK_LLM", "true")
    monkeypatch.setattr(emb_service, "_chroma_client", None)

    def fake_compute_embedding(text: str) -> list[float]:
        # Generate a deterministic 16-dim normalized vector from text hash
        h = hashlib.sha256(text.encode("utf-8")).digest()
        vec = [float(b) / 255.0 for b in h[:16]]
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    monkeypatch.setattr(emb_service, "compute_embedding", fake_compute_embedding)
    yield chroma_dir
    monkeypatch.setattr(emb_service, "_chroma_client", None)


# ---- Auth Helper Fixtures ----

def _register_and_login(client, email, password, role, company_name=None, company_id=None, approver_role=None):
    """Register a user and login, returning (auth_headers, user_data)."""
    payload = {"email": email, "password": password, "role": role}
    if company_name:
        payload["company_name"] = company_name
    if company_id:
        payload["company_id"] = company_id
    if approver_role:
        payload["approver_role"] = approver_role

    reg_res = client.post("/auth/register", json=payload)
    assert reg_res.status_code == 201, f"Registration failed: {reg_res.json()}"

    login_res = client.post("/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200, f"Login failed: {login_res.json()}"

    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, reg_res.json()


@pytest.fixture
def register_user(client):
    """Factory fixture: returns a function to register a user and get auth headers."""
    def _register(email, password, role, **kwargs):
        return _register_and_login(client, email, password, role, **kwargs)
    return _register


@pytest.fixture
def candidate_auth(client):
    """Pre-registers a candidate user and returns (headers, user_data)."""
    return _register_and_login(client, "candidate@test.com", "TestPass123!", "candidate")


@pytest.fixture
def hr_auth(client):
    """Pre-registers an HR user with a new company and returns (headers, user_data)."""
    return _register_and_login(client, "hr@test.com", "TestPass123!", "hr", company_name="TestCorp")


@pytest.fixture
def admin_auth(client):
    """Pre-registers an admin user and returns (headers, user_data)."""
    return _register_and_login(client, "admin@test.com", "TestPass123!", "admin")


@pytest.fixture
def approver_auth(client, hr_auth):
    """
    Pre-registers a hiring_manager approver user in the same company as HR.
    Returns (headers, user_data).
    """
    _, hr_user = hr_auth
    company_id = hr_user["company_id"]
    return _register_and_login(
        client, "approver@test.com", "TestPass123!", "approver",
        company_id=company_id, approver_role="hiring_manager",
    )


@pytest.fixture
def director_approver_auth(client, hr_auth):
    """
    Pre-registers a director approver in the same company as HR.
    Returns (headers, user_data).
    """
    _, hr_user = hr_auth
    company_id = hr_user["company_id"]
    return _register_and_login(
        client, "director@test.com", "TestPass123!", "approver",
        company_id=company_id, approver_role="director",
    )


@pytest.fixture
def vp_approver_auth(client, hr_auth):
    """
    Pre-registers a VP approver in the same company as HR.
    Returns (headers, user_data).
    """
    _, hr_user = hr_auth
    company_id = hr_user["company_id"]
    return _register_and_login(
        client, "vp@test.com", "TestPass123!", "approver",
        company_id=company_id, approver_role="vp",
    )


@pytest.fixture
def ceo_approver_auth(client, hr_auth):
    """
    Pre-registers a CEO approver in the same company as HR.
    Returns (headers, user_data).
    """
    _, hr_user = hr_auth
    company_id = hr_user["company_id"]
    return _register_and_login(
        client, "ceo@test.com", "TestPass123!", "approver",
        company_id=company_id, approver_role="ceo",
    )
