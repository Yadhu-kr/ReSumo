import json
import logging
from unittest.mock import MagicMock
import pytest
import torch
import httpx

from app.schemas import ParsedResumeData
from app.services.extraction import (
    SYSTEM_PROMPT,
    MockExtractionProvider,
    FineTunedExtractionProvider,
    get_extraction_provider,
    reset_extraction_provider_cache,
)
from app.services.llm import MockLLMProvider
from app.services.embeddings import get_candidates_collection


@pytest.fixture(autouse=True)
def clean_provider_cache():
    """Ensures extraction provider cache is reset before and after each test."""
    reset_extraction_provider_cache()
    yield
    reset_extraction_provider_cache()


class DummyConfig:
    def __init__(self):
        self.use_cache = False


class DummyTokenizer:
    def __init__(self, raw_output: str):
        self.raw_output = raw_output

    def __call__(self, text, return_tensors=None):
        return {
            "input_ids": torch.tensor([[101, 102, 103]]),
            "attention_mask": torch.tensor([[1, 1, 1]]),
        }

    def decode(self, tokens, skip_special_tokens=True):
        return self.raw_output


class DummyModel:
    def __init__(self, device=None, should_raise=None):
        self.config = DummyConfig()
        self.device = device or torch.device("cpu")
        self.last_generate_kwargs = {}
        self.should_raise = should_raise

    def generate(self, **kwargs):
        if self.should_raise:
            raise self.should_raise
        self.last_generate_kwargs = kwargs
        # Return input tokens + 2 new generated tokens
        return torch.tensor([[101, 102, 103, 201, 202]])


VALID_MODEL_JSON = {
    "current_title": "Staff Software Engineer",
    "previous_titles": ["Senior Backend Developer", "Software Engineer"],
    "current_company": "Acme Systems",
    "previous_companies": ["Startup Inc", "Legacy Corp"],
    "years_experience": 8.5,
    "seniority": "lead",
    "primary_domain": "Cloud Infrastructure",
    "industries": ["Cloud Computing", "Fintech"],
    "core_skills": ["Go", "Kubernetes", "PostgreSQL"],
    "secondary_skills": ["Terraform", "Python", "gRPC"],
    "tools": ["Docker", "Prometheus", "Git"],
    "leadership_experience": True,
    "key_achievements": [
        "Scaled distributed cluster across 5 regions",
        "Decreased system latency by 35%",
    ],
    "location": "New York, NY",
    "summary": "Experienced infrastructure and backend lead with 8+ years building high availability systems.",
}


def test_fine_tuned_extraction_provider_happy_path():
    """Happy path: clean resume text in, valid ParsedResumeData out."""
    raw_json_str = json.dumps(VALID_MODEL_JSON)
    tokenizer = DummyTokenizer(raw_output=raw_json_str)
    model = DummyModel()

    provider = FineTunedExtractionProvider(model=model, tokenizer=tokenizer)
    resume_text = "Staff Software Engineer at Acme Systems with 8.5 years of experience."

    result = provider.extract(raw_text=resume_text, resume_id="test-resume-1")

    assert result is not None
    assert isinstance(result, ParsedResumeData)
    assert result.current_title == "Staff Software Engineer"
    assert result.seniority == "lead"
    assert result.years_experience == 8.5
    assert result.current_company == "Acme Systems"
    assert "Go" in result.core_skills
    assert "Kubernetes" in result.core_skills
    assert result.leadership_experience is True
    assert result.location == "New York, NY"

    # Verify model config explicitly set before generation
    assert model.config.use_cache is True
    # Verify decoding parameters
    gen_kwargs = model.last_generate_kwargs
    assert gen_kwargs.get("temperature") == 0.0
    assert gen_kwargs.get("do_sample") is False
    assert gen_kwargs.get("max_new_tokens") == 300


def test_fine_tuned_extraction_provider_markdown_fenced_json():
    """Confirms provider handles markdown ```json ... ``` codeblocks gracefully."""
    fenced_output = f"```json\n{json.dumps(VALID_MODEL_JSON)}\n```"
    tokenizer = DummyTokenizer(raw_output=fenced_output)
    model = DummyModel()

    provider = FineTunedExtractionProvider(model=model, tokenizer=tokenizer)
    result = provider.extract("Resume content", resume_id="test-resume-fence")

    assert result is not None
    assert isinstance(result, ParsedResumeData)
    assert result.current_title == "Staff Software Engineer"


def test_fine_tuned_extraction_provider_malformed_json(caplog):
    """Malformed JSON from the model: confirm no exception propagates, logs warning, returns None."""
    malformed_output = '{"current_title": "Software Engineer", "previous_titles": ["Dev"'  # truncated
    tokenizer = DummyTokenizer(raw_output=malformed_output)
    model = DummyModel()

    provider = FineTunedExtractionProvider(model=model, tokenizer=tokenizer)

    with caplog.at_level(logging.WARNING):
        result = provider.extract(
            raw_text="Corrupted resume text",
            resume_id="resume-malformed-999",
        )

    # Must return None without raising JSONDecodeError
    assert result is None

    # Confirm candidate ID and raw output are logged
    assert "resume-malformed-999" in caplog.text
    assert "Extraction failed to produce valid JSON" in caplog.text


def test_upload_resume_malformed_json_fallback_stores_raw_text_and_indexes_chroma(
    client, candidate_auth, monkeypatch
):
    """
    Simulate model returning malformed JSON in /upload-resume:
    - Pipeline does not crash (returns 201).
    - parsed_status is set to 'extraction_failed'.
    - raw_text fallback is stored in database.
    - parsed_data remains None.
    - Raw text fallback is upserted into Chroma so candidate remains matchable by Phase 2.
    """
    monkeypatch.setenv("EXTRACTION_PROVIDER", "fine-tuned")

    import app.routers.resumes as resumes_mod

    mock_provider = FineTunedExtractionProvider(
        model=DummyModel(),
        tokenizer=DummyTokenizer(raw_output="Sorry, I cannot parse this resume as JSON."),
    )
    monkeypatch.setattr(resumes_mod, "get_extraction_provider", lambda: mock_provider)

    headers, _ = candidate_auth
    resume_text = "Raw OCR messy text from garbled PDF resume that breaks JSON output"

    response = client.post(
        "/upload-resume",
        files={"file": ("messy_resume.txt", resume_text.encode("utf-8"), "text/plain")},
        headers=headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "extraction_failed"
    assert "extraction failed to produce valid structured data" in data["message"]

    # Verify DB record: parsed_status='extraction_failed', raw_text preserved, parsed_data=None
    candidate_res = client.get(f"/candidates/{data['candidate_id']}", headers=headers)
    assert candidate_res.status_code == 200
    candidate = candidate_res.json()
    assert candidate["parsed_status"] == "extraction_failed"
    assert candidate["raw_text"] == resume_text
    assert candidate["parsed_data"] is None

    # Verify Chroma vector entry exists for candidate with unstructured raw_text
    collection = get_candidates_collection()
    chroma_entry = collection.get(ids=[data["candidate_id"]])
    assert len(chroma_entry["ids"]) == 1
    assert chroma_entry["ids"][0] == data["candidate_id"]
    assert len(chroma_entry["documents"]) == 1
    assert chroma_entry["documents"][0] == resume_text


def test_upload_resume_generation_runtime_exception_fallback(
    client, candidate_auth, monkeypatch, caplog
):
    """
    Simulate model throwing generation exception (e.g. CUDA OOM or device error):
    - Exception is caught and logged; does not crash FastAPI with 500.
    - Returns 201 with status='extraction_failed'.
    - Fallback raw_text is stored and indexed in Chroma.
    """
    monkeypatch.setenv("EXTRACTION_PROVIDER", "fine-tuned")

    import app.routers.resumes as resumes_mod

    oom_model = DummyModel(should_raise=RuntimeError("CUDA out of memory during generation"))
    mock_provider = FineTunedExtractionProvider(
        model=oom_model,
        tokenizer=DummyTokenizer(raw_output=""),
    )
    monkeypatch.setattr(resumes_mod, "get_extraction_provider", lambda: mock_provider)

    headers, _ = candidate_auth
    resume_text = "Experienced Python Engineer resume text"

    with caplog.at_level(logging.WARNING):
        response = client.post(
            "/upload-resume",
            files={"file": ("oom_resume.txt", resume_text.encode("utf-8"), "text/plain")},
            headers=headers,
        )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "extraction_failed"

    # Confirm candidate logged and stored
    candidate_res = client.get(f"/candidates/{data['candidate_id']}", headers=headers)
    assert candidate_res.status_code == 200
    assert candidate_res.json()["parsed_status"] == "extraction_failed"
    assert candidate_res.json()["raw_text"] == resume_text

    # Confirm fallback Chroma entry created
    collection = get_candidates_collection()
    chroma_entry = collection.get(ids=[data["candidate_id"]])
    assert len(chroma_entry["ids"]) == 1
    assert chroma_entry["documents"][0] == resume_text


def test_upload_resume_fine_tuned_happy_path(client, candidate_auth, monkeypatch):
    """
    Simulate model returning valid JSON in /upload-resume:
    - Pipeline stores parsed_data in DB.
    - parsed_status is set to 'parsed'.
    - response status is 'parsed'.
    """
    monkeypatch.setenv("EXTRACTION_PROVIDER", "fine-tuned")

    import app.routers.resumes as resumes_mod

    mock_provider = FineTunedExtractionProvider(
        model=DummyModel(),
        tokenizer=DummyTokenizer(raw_output=json.dumps(VALID_MODEL_JSON)),
    )
    monkeypatch.setattr(resumes_mod, "get_extraction_provider", lambda: mock_provider)

    headers, _ = candidate_auth
    resume_text = "Staff Software Engineer at Acme Systems"

    response = client.post(
        "/upload-resume",
        files={"file": ("staff_resume.txt", resume_text.encode("utf-8"), "text/plain")},
        headers=headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "parsed"

    candidate_res = client.get(f"/candidates/{data['candidate_id']}", headers=headers)
    assert candidate_res.status_code == 200
    candidate = candidate_res.json()
    assert candidate["parsed_status"] == "parsed"
    assert candidate["parsed_data"]["current_title"] == "Staff Software Engineer"
    assert candidate["parsed_data"]["seniority"] == "lead"
    assert candidate["raw_text"] == resume_text


def test_fine_tuned_model_loaded_only_once_across_multiple_calls(monkeypatch):
    """
    Confirms base model and LoRA adapter from_pretrained loading happens at most once
    across multiple sequential extract() calls (model loading is cached as singleton).
    """
    mock_tokenizer = DummyTokenizer(raw_output=json.dumps(VALID_MODEL_JSON))
    mock_model = DummyModel()

    mock_from_pretrained_tokenizer = MagicMock(return_value=mock_tokenizer)
    mock_from_pretrained_model = MagicMock(return_value=mock_model)
    mock_from_pretrained_peft = MagicMock(return_value=mock_model)

    import transformers
    import peft

    monkeypatch.setattr(transformers.AutoTokenizer, "from_pretrained", mock_from_pretrained_tokenizer)
    monkeypatch.setattr(transformers.AutoModelForCausalLM, "from_pretrained", mock_from_pretrained_model)
    monkeypatch.setattr(peft.PeftModel, "from_pretrained", mock_from_pretrained_peft)

    provider = FineTunedExtractionProvider()

    # Call extract multiple times
    res1 = provider.extract("Resume text 1", resume_id="res-1")
    res2 = provider.extract("Resume text 2", resume_id="res-2")
    res3 = provider.extract("Resume text 3", resume_id="res-3")

    assert res1 is not None
    assert res2 is not None
    assert res3 is not None

    # Assert model loading was performed exactly once
    assert mock_from_pretrained_tokenizer.call_count == 1
    assert mock_from_pretrained_model.call_count == 1
    assert mock_from_pretrained_peft.call_count == 1

    # Second provider instance should also reuse the shared class-level model
    provider2 = FineTunedExtractionProvider()
    res4 = provider2.extract("Resume text 4", resume_id="res-4")
    assert res4 is not None

    assert mock_from_pretrained_tokenizer.call_count == 1
    assert mock_from_pretrained_model.call_count == 1
    assert mock_from_pretrained_peft.call_count == 1


def test_get_extraction_provider_singleton_instance(monkeypatch):
    """Confirm get_extraction_provider returns the same provider instance across calls."""
    monkeypatch.setenv("EXTRACTION_PROVIDER", "fine-tuned")

    p1 = get_extraction_provider()
    p2 = get_extraction_provider()

    assert p1 is not None
    assert p1 is p2
    assert p1.provider_name == "fine-tuned"


def test_extraction_provider_selection_env(monkeypatch):
    """Confirm provider selection (mock vs fine-tuned) is driven by config/env."""
    # 1. Explicit EXTRACTION_PROVIDER=mock -> MockExtractionProvider
    monkeypatch.setenv("EXTRACTION_PROVIDER", "mock")
    provider = get_extraction_provider()
    assert isinstance(provider, MockExtractionProvider)
    assert provider.provider_name == "mock"

    # 2. Explicit EXTRACTION_PROVIDER=fine-tuned -> FineTunedExtractionProvider
    monkeypatch.setenv("EXTRACTION_PROVIDER", "fine-tuned")
    provider = get_extraction_provider()
    assert isinstance(provider, FineTunedExtractionProvider)
    assert provider.provider_name == "fine-tuned"
    assert provider.base_model_name == "openai/gpt-oss-20b"
    assert provider.adapter_name == "JanCT05/resume-parser-gpt-oss-20b"
    assert provider.adapter_revision == "checkpoint-350-htmlclean"

    # 3. EXTRACTION_PROVIDER=none or disabled -> None
    monkeypatch.setenv("EXTRACTION_PROVIDER", "disabled")
    assert get_extraction_provider() is None

    # 4. Fallback when EXTRACTION_PROVIDER unset:
    monkeypatch.delenv("EXTRACTION_PROVIDER", raising=False)
    monkeypatch.setenv("MOCK_EXTRACTION", "true")
    assert isinstance(get_extraction_provider(), MockExtractionProvider)

    monkeypatch.setenv("MOCK_EXTRACTION", "false")
    assert get_extraction_provider() is None


def test_system_prompt_verbatim():
    """Verify system prompt exact 15 keys verbatim match requirement."""
    expected_prompt = (
        "You are an expert resume parser. Extract structured information from resumes into "
        "a JSON object with the following exact 15 keys: current_title, previous_titles, "
        "current_company, previous_companies, years_experience, seniority, primary_domain, "
        "industries, core_skills, secondary_skills, tools, leadership_experience, "
        "key_achievements, location, summary. Return ONLY valid JSON. Do not include "
        "explanations or extra text."
    )
    assert SYSTEM_PROMPT == expected_prompt


def test_mock_llm_provider_untouched():
    """Confirm MockLLMProvider is untouched and still functional for match rationales."""
    provider = MockLLMProvider()
    assert provider.provider_name == "mock"

    rationale = provider.generate_match_rationale(
        job_title="Lead Architect",
        job_description="Designing scalable cloud systems",
        job_role_tier="senior",
        candidate_data={
            "seniority": "senior",
            "current_title": "Senior Backend Engineer",
            "years_experience": 7.0,
            "core_skills": ["Python", "FastAPI"],
        },
        similarity_score=0.85,
    )

    assert "senior" in rationale.lower()
    assert "7.0" in rationale
    assert "Senior Backend Engineer" in rationale
    assert "Python, FastAPI" in rationale


def test_groq_extraction_provider_mocked_http(monkeypatch):
    """Test GroqExtractionProvider with mocked HTTP response."""
    from app.services.extraction import GroqExtractionProvider

    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(VALID_MODEL_JSON),
                }
            }
        ]
    }
    mock_resp.raise_for_status = MagicMock()

    class MockHttpClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, headers=None, json=None):
            return mock_resp

    import httpx
    monkeypatch.setattr(httpx, "Client", MockHttpClient)

    provider = GroqExtractionProvider(api_key="gsk-test-key")
    result = provider.extract("Sample resume text", resume_id="test-123")

    assert result is not None
    assert result.current_title == "Staff Software Engineer"
    assert result.seniority == "lead"
    assert result.years_experience == 8.5
    assert result.leadership_experience is True


def test_groq_extraction_provider_handles_api_failure(monkeypatch):
    """Test GroqExtractionProvider gracefully catches network or API failures and returns None."""
    from app.services.extraction import GroqExtractionProvider

    class FailingHttpClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, headers=None, json=None):
            raise RuntimeError("API timeout or rate limit")

    import httpx
    monkeypatch.setattr(httpx, "Client", FailingHttpClient)

    provider = GroqExtractionProvider(api_key="gsk-test-key")
    result = provider.extract("Sample resume text", resume_id="test-456")

    assert result is None


def test_groq_and_remote_provider_selection_env(monkeypatch):
    """Test provider factory selection for groq and remote."""
    from app.services.extraction import GroqExtractionProvider, RemoteExtractionProvider

    # Test EXTRACTION_PROVIDER=groq
    monkeypatch.setenv("EXTRACTION_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "gsk-dummy")
    p_groq = get_extraction_provider()
    assert isinstance(p_groq, GroqExtractionProvider)
    assert p_groq.provider_name == "groq"

    # Test EXTRACTION_PROVIDER=remote
    reset_extraction_provider_cache()
    monkeypatch.setenv("EXTRACTION_PROVIDER", "remote")
    p_remote = get_extraction_provider()
    assert isinstance(p_remote, RemoteExtractionProvider)
    assert p_remote.provider_name == "remote"


# ---- QwenExtractionProvider Tests ----

VALID_15_KEY_WITH_NULLS = {
    "current_title": "Senior Python Engineer",
    "previous_titles": ["Python Developer"],
    "current_company": None,
    "previous_companies": None,
    "years_experience": 3.5,
    "seniority": "senior",
    "primary_domain": "Backend Engineering",
    "industries": ["Fintech"],
    "core_skills": ["Python", "FastAPI"],
    "secondary_skills": ["PostgreSQL"],
    "tools": None,
    "leadership_experience": False,
    "key_achievements": ["Built microservices"],
    "location": None,
    "summary": "Experienced engineer with backend focus.",
}


class MockQwenResponse:
    def __init__(self, content_str: str, status_code: int = 200):
        self.content_str = content_str
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            request = httpx.Request("POST", "http://test")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError(f"HTTP error {self.status_code}", request=request, response=response)

    def json(self):
        return {
            "choices": [
                {
                    "message": {
                        "content": self.content_str
                    }
                }
            ]
        }


import json as json_lib


def test_qwen_provider_selection_env(monkeypatch):
    """Test provider factory selection for qwen."""
    from app.services.extraction import QwenExtractionProvider

    monkeypatch.setenv("EXTRACTION_PROVIDER", "qwen")
    p_qwen = get_extraction_provider()
    assert isinstance(p_qwen, QwenExtractionProvider)
    assert p_qwen.provider_name == "qwen"


def test_qwen_provider_request_payload(monkeypatch):
    """5a: System message equals SYSTEM_PROMPT exactly, user message starts with 'Resume:\n', temp=0.0, max_tokens=640."""
    import httpx
    from app.services.extraction import QwenExtractionProvider
    from app.services.qwen_prompt import SYSTEM_PROMPT

    captured = {}

    class MockHttpClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return MockQwenResponse(json_lib.dumps(VALID_15_KEY_WITH_NULLS))

    monkeypatch.setattr(httpx, "Client", MockHttpClient)

    provider = QwenExtractionProvider(base_url="http://localhost:8001/v1", api_key="test-key")
    result = provider.extract("Senior engineer with 3.5 years experience.")

    assert result is not None
    payload = captured["json"]
    assert payload["model"] == "resume-parser"
    assert payload["temperature"] == 0.0
    assert payload["max_tokens"] == 640
    assert "response_format" not in payload
    assert payload["messages"][0]["role"] == "system"
    assert payload["messages"][0]["content"] == SYSTEM_PROMPT
    assert payload["messages"][1]["role"] == "user"
    assert payload["messages"][1]["content"].startswith("Resume:\n")


def test_qwen_provider_valid_15_key_with_nulls(monkeypatch):
    """5b: Valid 15-key reply with nulls in current_company, previous_companies, tools, location returns parsed result."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    class MockHttpClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(VALID_15_KEY_WITH_NULLS))

    monkeypatch.setattr(httpx, "Client", MockHttpClient)

    provider = QwenExtractionProvider()
    result = provider.extract("Resume text")

    assert isinstance(result, ParsedResumeData)
    assert result.current_title == "Senior Python Engineer"
    assert result.current_company is None
    assert result.previous_companies is None
    assert result.tools is None
    assert result.location is None
    assert result.years_experience == 3.5


def test_qwen_provider_years_experience_null(monkeypatch):
    """6a: years_experience null -> parsed result has years_experience None (not 0)."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    payload_dict = dict(VALID_15_KEY_WITH_NULLS)
    payload_dict["years_experience"] = None

    class MockHttpClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(payload_dict))

    monkeypatch.setattr(httpx, "Client", MockHttpClient)
    provider = QwenExtractionProvider()
    result = provider.extract("Resume text")
    assert result is not None
    assert result.years_experience is None


def test_qwen_provider_years_experience_float_and_invalid(monkeypatch):
    """6b: years_experience 1.5 -> 1.5; years_experience 'ten' -> None result (invalid)."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    # Case 1: 1.5 -> 1.5
    dict_1_5 = dict(VALID_15_KEY_WITH_NULLS)
    dict_1_5["years_experience"] = 1.5

    class MockHttpClient1:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(dict_1_5))

    monkeypatch.setattr(httpx, "Client", MockHttpClient1)
    provider = QwenExtractionProvider()
    res1 = provider.extract("Resume text")
    assert res1 is not None
    assert res1.years_experience == 1.5

    # Case 2: 'ten' -> None
    dict_ten = dict(VALID_15_KEY_WITH_NULLS)
    dict_ten["years_experience"] = "ten"

    class MockHttpClient2:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(dict_ten))

    monkeypatch.setattr(httpx, "Client", MockHttpClient2)
    res2 = provider.extract("Resume text")
    assert res2 is None


def test_qwen_provider_null_lists_converted_to_empty(monkeypatch):
    """6c: previous_titles / industries / secondary_skills / key_achievements null -> []."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    payload_dict = dict(VALID_15_KEY_WITH_NULLS)
    payload_dict["previous_titles"] = None
    payload_dict["industries"] = None
    payload_dict["secondary_skills"] = None
    payload_dict["key_achievements"] = None
    payload_dict["core_skills"] = None

    class MockHttpClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(payload_dict))

    monkeypatch.setattr(httpx, "Client", MockHttpClient)
    provider = QwenExtractionProvider()
    result = provider.extract("Resume text")
    assert result is not None
    assert result.previous_titles == []
    assert result.industries == []
    assert result.secondary_skills == []
    assert result.key_achievements == []
    assert result.core_skills == []


def test_qwen_provider_seniority_strict(monkeypatch):
    """6d: seniority 'Staff' -> None result; 'senior' -> OK."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    # Case 1: 'Staff' -> None result
    dict_staff = dict(VALID_15_KEY_WITH_NULLS)
    dict_staff["seniority"] = "Staff"

    class MockHttpClientStaff:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(dict_staff))

    monkeypatch.setattr(httpx, "Client", MockHttpClientStaff)
    provider = QwenExtractionProvider()
    assert provider.extract("Resume text") is None

    # Case 2: 'senior' -> OK
    dict_senior = dict(VALID_15_KEY_WITH_NULLS)
    dict_senior["seniority"] = "senior"

    class MockHttpClientSenior:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(dict_senior))

    monkeypatch.setattr(httpx, "Client", MockHttpClientSenior)
    res_ok = provider.extract("Resume text")
    assert res_ok is not None
    assert res_ok.seniority == "senior"


def test_qwen_provider_no_retry_on_invalid_json(monkeypatch):
    """6e: invalid JSON reply -> exactly ONE HTTP call is made (no retry)."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    call_count = 0

    class MockHttpClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            nonlocal call_count
            call_count += 1
            return MockQwenResponse("MALFORMED JSON {{{")

    monkeypatch.setattr(httpx, "Client", MockHttpClient)
    provider = QwenExtractionProvider()
    result = provider.extract("Resume text")
    assert result is None
    assert call_count == 1


def test_qwen_provider_retry_on_http_500(monkeypatch):
    """6f: HTTP 500 first, valid second -> result returned after 2 calls."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    call_count = 0

    class MockHttpClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return MockQwenResponse("Internal Server Error", status_code=500)
            return MockQwenResponse(json_lib.dumps(VALID_15_KEY_WITH_NULLS))

    monkeypatch.setattr(httpx, "Client", MockHttpClient)
    provider = QwenExtractionProvider()
    result = provider.extract("Resume text")
    assert result is not None
    assert result.current_title == "Senior Python Engineer"
    assert call_count == 2


def test_qwen_provider_tuned_style_all_nulls(monkeypatch):
    """6g: A tuned-style reply where current_company, previous_companies, tools, location are null and years_experience is null still parses."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    tuned_dict = dict(VALID_15_KEY_WITH_NULLS)
    tuned_dict["current_company"] = None
    tuned_dict["previous_companies"] = None
    tuned_dict["tools"] = None
    tuned_dict["location"] = None
    tuned_dict["years_experience"] = None

    class MockHttpClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(tuned_dict))

    monkeypatch.setattr(httpx, "Client", MockHttpClient)
    provider = QwenExtractionProvider()
    result = provider.extract("Resume text")
    assert result is not None
    assert result.current_company is None
    assert result.previous_companies is None
    assert result.tools is None
    assert result.location is None
    assert result.years_experience is None


def test_qwen_provider_rejects_duplicate_key(monkeypatch):
    """5e: Reply with a duplicate key returns None."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    dup_json = (
        '{"current_title": "Title 1", "current_title": "Title 2", '
        '"previous_titles": [], "current_company": null, "previous_companies": null, '
        '"years_experience": 2.0, "seniority": "mid", "primary_domain": "Backend", '
        '"industries": [], "core_skills": ["Python"], "secondary_skills": [], '
        '"tools": null, "leadership_experience": false, "key_achievements": [], '
        '"location": null, "summary": "Dev"}'
    )

    class MockHttpClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(dup_json)

    monkeypatch.setattr(httpx, "Client", MockHttpClient)

    provider = QwenExtractionProvider()
    result = provider.extract("Resume text")

    assert result is None


def test_qwen_provider_rejects_missing_or_extra_keys(monkeypatch):
    """5f: Reply with 14 keys or a 16th extra key returns None."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    # 14 keys (missing 'summary')
    fourteen_keys = dict(VALID_15_KEY_WITH_NULLS)
    del fourteen_keys["summary"]

    class MockHttpClient14:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(fourteen_keys))

    monkeypatch.setattr(httpx, "Client", MockHttpClient14)
    provider = QwenExtractionProvider()
    assert provider.extract("Resume text") is None

    # 16 keys (extra 'extra_field')
    sixteen_keys = dict(VALID_15_KEY_WITH_NULLS)
    sixteen_keys["extra_field"] = "not_allowed"

    class MockHttpClient16:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, headers=None, json=None):
            return MockQwenResponse(json_lib.dumps(sixteen_keys))

    monkeypatch.setattr(httpx, "Client", MockHttpClient16)
    provider = QwenExtractionProvider()
    assert provider.extract("Resume text") is None


def test_qwen_provider_no_retry_on_value_error_with_timeout_message(monkeypatch):
    """ValueError whose message contains 'timeout' is NOT a transport error and must NOT be retried."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    call_count = 0

    class MockHttpClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            nonlocal call_count
            call_count += 1
            raise ValueError("Something failed with timeout message inside string")

    monkeypatch.setattr(httpx, "Client", MockHttpClient)
    provider = QwenExtractionProvider()
    result = provider.extract("Resume text")
    assert result is None
    assert call_count == 1


def test_qwen_provider_no_retry_on_read_timeout(monkeypatch):
    """httpx.ReadTimeout must NOT be retried: call_count == 1 and result is None."""
    import httpx
    from app.services.extraction import QwenExtractionProvider

    call_count = 0

    class MockHttpClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, headers=None, json=None):
            nonlocal call_count
            call_count += 1
            raise httpx.ReadTimeout("Server took too long to send response headers")

    monkeypatch.setattr(httpx, "Client", MockHttpClient)
    provider = QwenExtractionProvider()
    result = provider.extract("Resume text")
    assert result is None
    assert call_count == 1





