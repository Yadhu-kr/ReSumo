import httpx
import pytest

from app.services.llm import (
    GroqLLMProvider,
    ClaudeLLMProvider,
    MockLLMProvider,
    get_llm_provider,
)


def test_groq_llm_provider_mocked_http_response(monkeypatch):
    """Verifies GroqLLMProvider calls OpenAI-compatible chat/completions and returns parsed text."""
    expected_rationale = (
        "Strong candidate alignment: Senior engineer with 6 years experience in Python and FastAPI, "
        "directly satisfying the senior-tier requirements."
    )

    class MockResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": expected_rationale,
                        }
                    }
                ]
            }

    captured_requests = []

    def mock_post(self, url, headers=None, json=None, **kwargs):
        captured_requests.append({"url": url, "headers": headers, "json": json})
        return MockResponse()

    monkeypatch.setattr(httpx.Client, "post", mock_post)

    provider = GroqLLMProvider(api_key="gsk_dummy_test_key_12345")
    candidate_data = {
        "seniority": "senior",
        "current_title": "Senior Backend Engineer",
        "years_experience": 6.0,
        "core_skills": ["Python", "FastAPI", "PostgreSQL"],
    }

    result = provider.generate_match_rationale(
        job_title="Lead Architect",
        job_description="Architecting microservices",
        job_role_tier="senior",
        candidate_data=candidate_data,
        similarity_score=0.88,
    )

    assert result == expected_rationale
    assert len(captured_requests) == 1
    req = captured_requests[0]
    assert req["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert req["headers"]["Authorization"] == "Bearer gsk_dummy_test_key_12345"
    assert req["json"]["model"] == "llama-3.1-8b-instant"


def test_groq_llm_provider_fallback_on_http_error(monkeypatch):
    """Verifies GroqLLMProvider gracefully falls back to deterministic MockLLMProvider on network failure."""
    def mock_post(self, *args, **kwargs):
        raise httpx.ConnectError("Connection refused")

    monkeypatch.setattr(httpx.Client, "post", mock_post)

    provider = GroqLLMProvider(api_key="gsk_dummy_test_key_12345")
    candidate_data = {
        "seniority": "mid",
        "current_title": "Backend Developer",
        "years_experience": 3.0,
        "core_skills": ["Python", "FastAPI"],
    }

    result = provider.generate_match_rationale(
        job_title="Python Engineer",
        job_description="Building APIs",
        job_role_tier="mid",
        candidate_data=candidate_data,
        similarity_score=0.75,
    )

    # Fallback to MockLLMProvider format
    assert "mid" in result
    assert "3.0" in result
    assert "Backend Developer" in result


def test_get_llm_provider_factory_priorities(monkeypatch):
    """Verifies factory selection order: MOCK_LLM -> GROQ_API_KEY -> ANTHROPIC_API_KEY -> fallback Mock."""
    # 1. MOCK_LLM=true takes precedence over any keys
    monkeypatch.setenv("MOCK_LLM", "true")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    assert isinstance(get_llm_provider(), MockLLMProvider)

    # 2. MOCK_LLM=false with GROQ_API_KEY set selects GroqLLMProvider
    monkeypatch.setenv("MOCK_LLM", "false")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    provider = get_llm_provider()
    assert isinstance(provider, GroqLLMProvider)
    assert provider.api_key == "gsk_test"
    assert provider.model == "llama-3.1-8b-instant"

    # 3. MOCK_LLM=false without GROQ_API_KEY but with ANTHROPIC_API_KEY selects ClaudeLLMProvider
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    claude_provider = get_llm_provider()
    assert isinstance(claude_provider, ClaudeLLMProvider)
    assert claude_provider.model == "claude-sonnet-5"

    # 4. MOCK_LLM=false with neither key falls back to MockLLMProvider
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    fallback_provider = get_llm_provider()
    assert isinstance(fallback_provider, MockLLMProvider)
