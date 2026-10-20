"""
Resume Extraction Service for Phase 1 / Stage 1 Ingestion.

Provides swappable extraction providers:
- MockExtractionProvider: Deterministic local generator returning synthetic 15-key
  structured data matching the sandeeppanem/resume-json-extraction-5k schema.
- FineTunedExtractionProvider: Production provider loading openai/gpt-oss-20b
  with QLoRA adapter JanCT05/resume-parser-gpt-oss-20b (revision checkpoint-350-htmlclean)
  in 4-bit NF4 quantization.
"""
import os
import json
import logging
from typing import Protocol, Any, runtime_checkable
import httpx

from app.schemas import ParsedResumeData

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an expert resume parser. Extract structured information from resumes into "
    "a JSON object with the following exact 15 keys: current_title, previous_titles, "
    "current_company, previous_companies, years_experience, seniority, primary_domain, "
    "industries, core_skills, secondary_skills, tools, leadership_experience, "
    "key_achievements, location, summary. Return ONLY valid JSON. Do not include "
    "explanations or extra text."
)


@runtime_checkable
class ExtractionProvider(Protocol):
    provider_name: str

    def extract(
        self,
        raw_text: str,
        resume_id: str | None = None,
    ) -> ParsedResumeData | dict[str, Any] | None:
        """Extracts structured resume data from raw plaintext."""
        ...

    def extract_resume_fields(
        self,
        file_path: str = "",
        raw_text: str | None = None,
        resume_id: str | None = None,
    ) -> ParsedResumeData | dict[str, Any] | None:
        """Adapter method compatible with the resume upload route."""
        ...


class MockExtractionProvider:
    """
    Deterministic mock provider returning contract-compliant structured resume data
    for testing without requiring a GPU or network calls.
    """
    provider_name: str = "mock"

    def extract(
        self,
        raw_text: str,
        resume_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            "current_title": "Senior Backend Engineer",
            "previous_titles": ["Backend Developer", "Software Engineer Intern"],
            "current_company": "Nexus Technologies",
            "previous_companies": ["Apex Software", "CloudCorp"],
            "years_experience": 5.5,
            "seniority": "senior",
            "primary_domain": "Backend & Cloud Architecture",
            "industries": ["Fintech", "SaaS", "E-commerce"],
            "core_skills": ["Python", "FastAPI", "PostgreSQL"],
            "secondary_skills": ["Docker", "Kubernetes", "Redis"],
            "tools": ["Git", "GitHub Actions", "Postman"],
            "leadership_experience": True,
            "key_achievements": [
                "Architected high-throughput microservice handling 10k RPS",
                "Reduced database query latency by 45% via indexing and caching",
                "Mentored 4 junior and mid-level developers",
            ],
            "location": "San Francisco, CA",
            "summary": "Senior backend engineer with 5+ years experience building scalable web services, microservices, and distributed pipelines.",
        }

    def extract_resume_fields(
        self,
        file_path: str = "",
        raw_text: str | None = None,
        resume_id: str | None = None,
    ) -> dict[str, Any]:
        return self.extract(raw_text or "", resume_id=resume_id)


# Alias for backward compatibility if referred to as MockLLMProvider in extraction context
MockLLMExtractionProvider = MockExtractionProvider


class FineTunedExtractionProvider:
    """
    Production extraction provider backed by fine-tuned 20B QLoRA model:
    - Base model: openai/gpt-oss-20b
    - Adapter: JanCT05/resume-parser-gpt-oss-20b
    - Adapter revision: checkpoint-350-htmlclean
    - 4-bit quantization via BitsAndBytesConfig (nf4, bfloat16)

    Lifecycle:
    The model and tokenizer are cached at the class level and instance level
    as singletons so they are loaded once across the entire process lifetime.
    """
    provider_name: str = "fine-tuned"
    _shared_model: Any = None
    _shared_tokenizer: Any = None

    def __init__(
        self,
        base_model_name: str = "openai/gpt-oss-20b",
        adapter_name: str = "JanCT05/resume-parser-gpt-oss-20b",
        adapter_revision: str = "checkpoint-350-htmlclean",
        model: Any = None,
        tokenizer: Any = None,
    ):
        self.base_model_name = base_model_name
        self.adapter_name = adapter_name
        self.adapter_revision = adapter_revision

        # Prioritize explicitly passed model/tokenizer, else use shared class cache
        self._model = model if model is not None else FineTunedExtractionProvider._shared_model
        self._tokenizer = tokenizer if tokenizer is not None else FineTunedExtractionProvider._shared_tokenizer

    def _load_model(self):
        """
        Loads base model in 4-bit and attaches PEFT LoRA adapter once.
        Re-uses already-loaded model across calls and instances.
        """
        if self._model is not None and self._tokenizer is not None:
            return self._model, self._tokenizer

        if (
            FineTunedExtractionProvider._shared_model is not None
            and FineTunedExtractionProvider._shared_tokenizer is not None
        ):
            self._model = FineTunedExtractionProvider._shared_model
            self._tokenizer = FineTunedExtractionProvider._shared_tokenizer
            return self._model, self._tokenizer

        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
            from peft import PeftModel
        except ImportError as e:
            raise RuntimeError(
                f"Missing ML dependencies for FineTunedExtractionProvider ({e}). "
                "Ensure torch, transformers, peft, and bitsandbytes are installed."
            ) from e

        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype="bfloat16",
        )

        tokenizer = AutoTokenizer.from_pretrained(self.base_model_name)

        base_model = AutoModelForCausalLM.from_pretrained(
            self.base_model_name,
            quantization_config=bnb_config,
            device_map="auto",
        )

        model = PeftModel.from_pretrained(
            base_model,
            self.adapter_name,
            revision=self.adapter_revision,
        )

        # Cache on class and instance
        FineTunedExtractionProvider._shared_model = model
        FineTunedExtractionProvider._shared_tokenizer = tokenizer
        self._model = model
        self._tokenizer = tokenizer
        return self._model, self._tokenizer

    def extract(
        self,
        raw_text: str,
        resume_id: str | None = None,
    ) -> ParsedResumeData | None:
        """
        Executes fine-tuned model inference to extract structured fields.
        Returns ParsedResumeData on success, or None on JSON failure/decode error.
        Catches all generation-time and decode exceptions so errors never propagate.
        """
        raw_output = None
        try:
            model, tokenizer = self._load_model()

            # Explicit requirement: set model.config.use_cache = True before generation
            if hasattr(model, "config"):
                model.config.use_cache = True

            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": raw_text},
            ]

            if hasattr(tokenizer, "apply_chat_template"):
                prompt_text = tokenizer.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=True,
                )
            else:
                prompt_text = f"<|system|>\n{SYSTEM_PROMPT}\n<|user|>\n{raw_text}\n<|assistant|>\n"

            inputs = tokenizer(prompt_text, return_tensors="pt")
            device = getattr(model, "device", None)
            if device is not None:
                inputs = {k: v.to(device) for k, v in inputs.items()}

            outputs = model.generate(
                **inputs,
                temperature=0.0,
                do_sample=False,
                max_new_tokens=300,
            )

            # Decode only newly generated tokens
            input_len = inputs["input_ids"].shape[1]
            generated_tokens = outputs[0][input_len:]
            raw_output = tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()

            clean_output = raw_output.strip()
            # Strip markdown codeblocks if present
            if clean_output.startswith("```json"):
                clean_output = clean_output[7:]
            elif clean_output.startswith("```"):
                clean_output = clean_output[3:]
            if clean_output.endswith("```"):
                clean_output = clean_output[:-3]
            clean_output = clean_output.strip()

            parsed_dict = json.loads(clean_output)
            # Map directly onto ParsedResumeData schema
            return ParsedResumeData(**parsed_dict)

        except json.JSONDecodeError as exc:
            logger.warning(
                "Extraction failed to produce valid JSON for resume %s: %s. Raw output: %r",
                resume_id or "unknown",
                exc,
                raw_output,
            )
            return None
        except Exception as exc:
            # Broad catch for CUDA OOM, timeouts, model invocation or schema errors
            logger.warning(
                "Extraction execution or schema validation failed for resume %s (%s): %s. Raw output: %r",
                resume_id or "unknown",
                type(exc).__name__,
                exc,
                raw_output,
            )
            return None

    def extract_resume_fields(
        self,
        file_path: str = "",
        raw_text: str | None = None,
        resume_id: str | None = None,
    ) -> ParsedResumeData | None:
        try:
            return self.extract(raw_text or "", resume_id=resume_id)
        except Exception as exc:
            logger.warning(
                "Unexpected error in extract_resume_fields for resume %s: %s",
                resume_id or "unknown",
                exc,
            )
            return None


class GroqExtractionProvider:
    """
    Cloud extraction provider calling Groq's high-speed inference API with JSON mode.
    Requires zero local VRAM or GPU resources, returning contract-compliant 15-key JSON in ~0.5s.
    """
    provider_name: str = "groq"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str = "https://api.groq.com/openai/v1",
        timeout: float = 30.0,
    ):
        self.api_key = api_key or os.getenv("GROQ_API_KEY", "").strip()
        self.model = model or os.getenv("GROQ_EXTRACTION_MODEL", "llama-3.3-70b-versatile")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def extract(
        self,
        raw_text: str,
        resume_id: str | None = None,
    ) -> ParsedResumeData | None:
        if not self.api_key:
            logger.warning("GroqExtractionProvider called but GROQ_API_KEY is not set.")
            return None

        import httpx

        prompt = (
            "Extract structured information from the following resume text into a single JSON object "
            "with the exact 15 keys required. Do NOT include name, email, or phone number.\n\n"
            f"Resume Text:\n\"\"\"\n{raw_text}\n\"\"\""
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
            "max_tokens": 1200,
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"].strip()

            clean_output = content
            if clean_output.startswith("```json"):
                clean_output = clean_output[7:]
            elif clean_output.startswith("```"):
                clean_output = clean_output[3:]
            if clean_output.endswith("```"):
                clean_output = clean_output[:-3]
            clean_output = clean_output.strip()

            parsed_dict = json.loads(clean_output)

            # Normalize seniority if model returned a variant
            if "seniority" in parsed_dict and isinstance(parsed_dict["seniority"], str):
                s = parsed_dict["seniority"].lower().strip()
                if s not in ("junior", "mid", "senior", "lead", "principal"):
                    if "lead" in s:
                        parsed_dict["seniority"] = "lead"
                    elif any(k in s for k in ("princ", "staff", "exec")):
                        parsed_dict["seniority"] = "principal"
                    elif "sen" in s:
                        parsed_dict["seniority"] = "senior"
                    elif any(k in s for k in ("jun", "entry", "intern")):
                        parsed_dict["seniority"] = "junior"
                    else:
                        parsed_dict["seniority"] = "mid"

            if "years_experience" in parsed_dict:
                try:
                    parsed_dict["years_experience"] = float(parsed_dict["years_experience"])
                except (ValueError, TypeError):
                    parsed_dict["years_experience"] = 0.0

            return ParsedResumeData(**parsed_dict)
        except Exception as exc:
            logger.warning(
                "Groq extraction failed for resume %s (%s): %s",
                resume_id or "unknown",
                type(exc).__name__,
                exc,
            )
            return None

    def extract_resume_fields(
        self,
        file_path: str = "",
        raw_text: str | None = None,
        resume_id: str | None = None,
    ) -> ParsedResumeData | None:
        try:
            return self.extract(raw_text or "", resume_id=resume_id)
        except Exception as exc:
            logger.warning("Unexpected error in Groq extract_resume_fields: %s", exc)
            return None


class RemoteExtractionProvider:
    """
    OpenAI-compatible remote extraction provider (e.g. Google Colab T4 ngrok tunnel or LM Studio).
    Allows hosting fine-tuned model (e.g. JanCT05/resume-parser-gpt-oss-20b) on a remote GPU worker.
    """
    provider_name: str = "remote"

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 60.0,
    ):
        self.base_url = (base_url or os.getenv("EXTRACTION_API_BASE_URL", "http://localhost:1234/v1")).rstrip("/")
        self.api_key = api_key or os.getenv("EXTRACTION_API_KEY", "dummy-key")
        self.model = model or os.getenv("EXTRACTION_REMOTE_MODEL", "JanCT05/resume-parser-gpt-oss-20b")
        self.timeout = timeout

    def extract(
        self,
        raw_text: str,
        resume_id: str | None = None,
    ) -> ParsedResumeData | None:
        import httpx

        prompt = (
            "Extract structured information from the following resume text into a single JSON object "
            "with the exact 15 keys required. Do NOT include name, email, or phone number.\n\n"
            f"Resume Text:\n\"\"\"\n{raw_text}\n\"\"\""
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
            "max_tokens": 1200,
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"].strip()

            clean_output = content
            if clean_output.startswith("```json"):
                clean_output = clean_output[7:]
            elif clean_output.startswith("```"):
                clean_output = clean_output[3:]
            if clean_output.endswith("```"):
                clean_output = clean_output[:-3]
            clean_output = clean_output.strip()

            parsed_dict = json.loads(clean_output)
            if "seniority" in parsed_dict and isinstance(parsed_dict["seniority"], str):
                s = parsed_dict["seniority"].lower().strip()
                if s not in ("junior", "mid", "senior", "lead", "principal"):
                    if "lead" in s:
                        parsed_dict["seniority"] = "lead"
                    elif any(k in s for k in ("princ", "staff", "exec")):
                        parsed_dict["seniority"] = "principal"
                    elif "sen" in s:
                        parsed_dict["seniority"] = "senior"
                    elif any(k in s for k in ("jun", "entry", "intern")):
                        parsed_dict["seniority"] = "junior"
                    else:
                        parsed_dict["seniority"] = "mid"

            if "years_experience" in parsed_dict:
                try:
                    parsed_dict["years_experience"] = float(parsed_dict["years_experience"])
                except (ValueError, TypeError):
                    parsed_dict["years_experience"] = 0.0

            return ParsedResumeData(**parsed_dict)
        except Exception as exc:
            logger.warning(
                "Remote extraction failed for resume %s (%s): %s",
                resume_id or "unknown",
                type(exc).__name__,
                exc,
            )
            return None

    def extract_resume_fields(
        self,
        file_path: str = "",
        raw_text: str | None = None,
        resume_id: str | None = None,
    ) -> ParsedResumeData | None:
        try:
            return self.extract(raw_text or "", resume_id=resume_id)
        except Exception as exc:
            logger.warning("Unexpected error in Remote extract_resume_fields: %s", exc)
            return None


QWEN_REQUIRED_KEYS = {
    "current_title",
    "previous_titles",
    "current_company",
    "previous_companies",
    "years_experience",
    "seniority",
    "primary_domain",
    "industries",
    "core_skills",
    "secondary_skills",
    "tools",
    "leadership_experience",
    "key_achievements",
    "location",
    "summary",
}


def _strict_json_object_pairs_hook(pairs):
    d = {}
    for k, v in pairs:
        if k in d:
            raise ValueError(f"Duplicate key detected in JSON: {k}")
        d[k] = v
    return d


class QwenExtractionProvider:
    """
    Production extraction provider calling fine-tuned Qwen2.5-7B resume parser endpoint
    via OpenAI-compatible API.
    """
    provider_name: str = "qwen"

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ):
        self.base_url = (base_url or os.getenv("EXTRACTION_API_BASE_URL", "http://localhost:1234/v1")).rstrip("/")
        self.api_key = api_key or os.getenv("EXTRACTION_API_KEY", "dummy-key")
        self.model = model or os.getenv("EXTRACTION_QWEN_MODEL", "resume-parser")
        if timeout is not None:
            self.timeout = float(timeout)
        else:
            try:
                self.timeout = float(os.getenv("EXTRACTION_TIMEOUT_SECONDS", "300"))
            except (ValueError, TypeError):
                self.timeout = 300.0

        timeout_val = int(self.timeout) if self.timeout.is_integer() else self.timeout
        logger.info(
            "Qwen extraction provider: base_url=%s model=%s timeout=%ss",
            self.base_url,
            self.model,
            timeout_val,
        )

    def _parse_reply(self, raw_content: str) -> ParsedResumeData:
        clean_output = raw_content.strip()
        if clean_output.startswith("```json"):
            clean_output = clean_output[7:]
        elif clean_output.startswith("```"):
            clean_output = clean_output[3:]
        if clean_output.endswith("```"):
            clean_output = clean_output[:-3]
        clean_output = clean_output.strip()

        parsed = json.loads(clean_output, object_pairs_hook=_strict_json_object_pairs_hook)
        if not isinstance(parsed, dict):
            raise ValueError("Parsed JSON response is not an object")

        parsed_keys = set(parsed.keys())
        if parsed_keys != QWEN_REQUIRED_KEYS:
            missing = QWEN_REQUIRED_KEYS - parsed_keys
            extra = parsed_keys - QWEN_REQUIRED_KEYS
            raise ValueError(f"Schema key mismatch: missing={missing}, extra={extra}")

        # Requirement 3: Seniority. Exact lowercase junior, mid, senior, lead, principal.
        allowed_seniority = {"junior", "mid", "senior", "lead", "principal"}
        sen = parsed.get("seniority")
        if sen not in allowed_seniority:
            raise ValueError(f"Invalid seniority '{sen}'. Allowed values: {allowed_seniority}")

        # Requirement 1: years_experience. None stays None, number converted with float(), anything else raises ValueError.
        years_exp = parsed.get("years_experience")
        if years_exp is None:
            parsed["years_experience"] = None
        elif isinstance(years_exp, bool):
            raise ValueError(f"years_experience cannot be a boolean: {years_exp}")
        elif isinstance(years_exp, (int, float)):
            parsed["years_experience"] = float(years_exp)
        else:
            raise ValueError(f"years_experience must be a number or null, got {type(years_exp).__name__}")

        # Requirement 2: Null lists.
        # If previous_titles, industries, secondary_skills, key_achievements, or core_skills is None, convert to [].
        # Leave tools as None if None.
        for list_key in ("previous_titles", "industries", "secondary_skills", "key_achievements", "core_skills"):
            if parsed.get(list_key) is None:
                parsed[list_key] = []

        return ParsedResumeData(**parsed)

    def extract(
        self,
        raw_text: str,
        resume_id: str | None = None,
    ) -> ParsedResumeData | None:
        import httpx
        from app.services.qwen_prompt import build_messages

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": build_messages(raw_text),
            "temperature": 0.0,
            "max_tokens": 640,
        }

        max_attempts = 2
        for attempt in range(max_attempts):
            resp = None
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.post(
                        f"{self.base_url}/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    resp.raise_for_status()
            except Exception as req_err:
                # Retry ONCE only for: httpx connection/network errors, HTTP 429, or HTTP >= 500. Timeouts are NOT retried.
                status_code = getattr(getattr(req_err, "response", None), "status_code", None)
                if status_code is None and hasattr(req_err, "status_code"):
                    status_code = req_err.status_code

                is_retryable = False
                if isinstance(req_err, httpx.TimeoutException):
                    is_retryable = False
                elif isinstance(req_err, (httpx.ConnectError, httpx.NetworkError)):
                    is_retryable = True
                elif status_code is not None:
                    is_retryable = (status_code == 429 or status_code >= 500)

                logger.warning(
                    "Qwen extraction transport error (attempt %d/%d, base_url=%s, model=%s) for resume %s (%s): %s",
                    attempt + 1,
                    max_attempts,
                    self.base_url,
                    self.model,
                    resume_id or "unknown",
                    type(req_err).__name__,
                    req_err,
                )
                if is_retryable and attempt == 0:
                    continue
                return None

            # Response arrived successfully. If reply is invalid, do NOT retry: log warning and return None.
            try:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return self._parse_reply(content)
            except Exception as parse_err:
                logger.warning(
                    "Qwen extraction response parsing failed (base_url=%s, model=%s) for resume %s (%s): %s",
                    self.base_url,
                    self.model,
                    resume_id or "unknown",
                    type(parse_err).__name__,
                    parse_err,
                )
                return None

        return None

    def extract_resume_fields(
        self,
        file_path: str = "",
        raw_text: str | None = None,
        resume_id: str | None = None,
    ) -> ParsedResumeData | None:
        try:
            return self.extract(raw_text or "", resume_id=resume_id)
        except Exception as exc:
            logger.warning("Unexpected error in Qwen extract_resume_fields: %s", exc)
            return None


# Module-level singletons for providers
_cached_finetuned_provider: FineTunedExtractionProvider | None = None
_cached_mock_provider: MockExtractionProvider | None = None
_cached_groq_provider: GroqExtractionProvider | None = None
_cached_remote_provider: RemoteExtractionProvider | None = None
_cached_qwen_provider: QwenExtractionProvider | None = None


def reset_extraction_provider_cache():
    """Resets cached singletons (used in test suite for clean isolation)."""
    global _cached_finetuned_provider, _cached_mock_provider, _cached_groq_provider, _cached_remote_provider, _cached_qwen_provider
    _cached_finetuned_provider = None
    _cached_mock_provider = None
    _cached_groq_provider = None
    _cached_remote_provider = None
    _cached_qwen_provider = None
    FineTunedExtractionProvider._shared_model = None
    FineTunedExtractionProvider._shared_tokenizer = None


def get_extraction_provider() -> ExtractionProvider | None:
    """
    Factory returning the configured extraction provider singleton:
    1. If EXTRACTION_PROVIDER in ("fine-tuned", "finetuned") -> cached FineTunedExtractionProvider.
    2. If EXTRACTION_PROVIDER == "qwen" -> cached QwenExtractionProvider.
    3. If EXTRACTION_PROVIDER == "groq" -> cached GroqExtractionProvider.
    4. If EXTRACTION_PROVIDER in ("remote", "openai") -> cached RemoteExtractionProvider.
    5. If EXTRACTION_PROVIDER in ("mock",) -> cached MockExtractionProvider.
    6. If EXTRACTION_PROVIDER in ("none", "disabled") -> None.
    7. Else fallback to MOCK_EXTRACTION flag:
       - If MOCK_EXTRACTION is true (default):
           - If GROQ_API_KEY is present and EXTRACTION_PROVIDER != "mock" -> returns GroqExtractionProvider
           - Else -> MockExtractionProvider
       - If MOCK_EXTRACTION is false -> None (unwired mode for test suite).
    """
    global _cached_finetuned_provider, _cached_mock_provider, _cached_groq_provider, _cached_remote_provider, _cached_qwen_provider

    provider_env = os.getenv("EXTRACTION_PROVIDER", "").strip().lower()
    if provider_env in ("fine-tuned", "finetuned"):
        if _cached_finetuned_provider is None:
            _cached_finetuned_provider = FineTunedExtractionProvider()
        return _cached_finetuned_provider
    elif provider_env == "qwen":
        if _cached_qwen_provider is None:
            _cached_qwen_provider = QwenExtractionProvider()
        return _cached_qwen_provider
    elif provider_env == "groq":
        if _cached_groq_provider is None:
            _cached_groq_provider = GroqExtractionProvider()
        return _cached_groq_provider
    elif provider_env in ("remote", "openai"):
        if _cached_remote_provider is None:
            _cached_remote_provider = RemoteExtractionProvider()
        return _cached_remote_provider
    elif provider_env == "mock":
        if _cached_mock_provider is None:
            _cached_mock_provider = MockExtractionProvider()
        return _cached_mock_provider
    elif provider_env in ("none", "disabled"):
        return None

    # Fallback based on MOCK_EXTRACTION flag
    mock_extraction = os.getenv("MOCK_EXTRACTION", "true").lower() in ("1", "true", "yes")
    if mock_extraction:
        # If GROQ_API_KEY is explicitly configured and provider not forced to mock, use Groq
        if os.getenv("GROQ_API_KEY", "").strip() and provider_env != "mock":
            if _cached_groq_provider is None:
                _cached_groq_provider = GroqExtractionProvider()
            return _cached_groq_provider

        if _cached_mock_provider is None:
            _cached_mock_provider = MockExtractionProvider()
        return _cached_mock_provider

    return None
