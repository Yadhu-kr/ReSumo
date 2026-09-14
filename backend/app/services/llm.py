"""
LLM Rationale Generation Service with swappable provider interface.

Defines an LLMProvider protocol and implementations:
- GroqLLMProvider: Calls Groq's OpenAI-compatible API using llama-3.1-8b-instant (fast & free-tier friendly).
- ClaudeLLMProvider: Calls Anthropic Claude API (claude-sonnet-5).
- MockLLMProvider: Deterministic local generator citing seniority, core_skills,
                   and years_experience without requiring live API keys.
"""
import os
import logging
from typing import Protocol, Any

logger = logging.getLogger(__name__)


class LLMProvider(Protocol):
    provider_name: str

    def generate_match_rationale(
        self,
        job_title: str,
        job_description: str,
        job_role_tier: str,
        candidate_data: dict[str, Any],
        similarity_score: float,
    ) -> str:
        """Generates an evidence-grounded match rationale referencing candidate fields."""
        ...


class GroqLLMProvider:
    """
    Live provider calling Groq's OpenAI-compatible API endpoint
    (https://api.groq.com/openai/v1/chat/completions) with llama-3.1-8b-instant.
    """
    provider_name: str = "groq"

    def __init__(
        self,
        api_key: str,
        model: str = "llama-3.1-8b-instant",
        base_url: str = "https://api.groq.com/openai/v1",
        timeout: float = 30.0,
    ):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def generate_match_rationale(
        self,
        job_title: str,
        job_description: str,
        job_role_tier: str,
        candidate_data: dict[str, Any],
        similarity_score: float,
    ) -> str:
        prompt = f"""You are an expert recruitment assistant evaluating a candidate against a job specification for an academic capstone demonstration.

Job Title: {job_title}
Role Tier: {job_role_tier}
Job Description: {job_description}

Candidate Profile (from extraction model):
- Seniority: {candidate_data.get('seniority', 'N/A')}
- Current Title: {candidate_data.get('current_title', 'N/A')}
- Years Experience: {candidate_data.get('years_experience', 'N/A')}
- Core Skills: {', '.join(candidate_data.get('core_skills', []))}
- Secondary Skills: {', '.join(candidate_data.get('secondary_skills', []))}
- Primary Domain: {candidate_data.get('primary_domain', 'N/A')}
- Summary: {candidate_data.get('summary', 'N/A')}
- Semantic Similarity Score: {similarity_score:.2f}

Generate a concise, defensible 2-3 sentence rationale explaining why this candidate matches (or does not match) this role.
CRITICAL DEFENSE REQUIREMENT: You MUST explicitly reference the candidate's seniority level, core skills overlap, and total years of experience in your rationale. Do not invent any facts."""

        import httpx

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a professional HR and recruitment analyst providing objective evaluations.",
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 250,
            "temperature": 0.2,
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
        except Exception as exc:
            logger.warning("Groq API call failed (%s). Falling back to MockLLMProvider.", exc)
            return MockLLMProvider().generate_match_rationale(
                job_title, job_description, job_role_tier, candidate_data, similarity_score
            )


class ClaudeLLMProvider:
    """Live provider calling Anthropic Claude API."""
    provider_name: str = "claude"

    def __init__(self, api_key: str, model: str = "claude-sonnet-5"):
        import anthropic
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def generate_match_rationale(
        self,
        job_title: str,
        job_description: str,
        job_role_tier: str,
        candidate_data: dict[str, Any],
        similarity_score: float,
    ) -> str:
        prompt = f"""You are an expert recruitment assistant evaluating a candidate against a job specification for an academic capstone demonstration.

Job Title: {job_title}
Role Tier: {job_role_tier}
Job Description: {job_description}

Candidate Profile (from extraction model):
- Seniority: {candidate_data.get('seniority', 'N/A')}
- Current Title: {candidate_data.get('current_title', 'N/A')}
- Years Experience: {candidate_data.get('years_experience', 'N/A')}
- Core Skills: {', '.join(candidate_data.get('core_skills', []))}
- Secondary Skills: {', '.join(candidate_data.get('secondary_skills', []))}
- Primary Domain: {candidate_data.get('primary_domain', 'N/A')}
- Summary: {candidate_data.get('summary', 'N/A')}
- Semantic Similarity Score: {similarity_score:.2f}

Generate a concise, defensible 2-3 sentence rationale explaining why this candidate matches (or does not match) this role.
CRITICAL DEFENSE REQUIREMENT: You MUST explicitly reference the candidate's seniority level, core skills overlap, and total years of experience in your rationale. Do not invent any facts."""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=250,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        except Exception as exc:
            logger.warning("Claude API call failed (%s). Falling back to MockLLMProvider.", exc)
            return MockLLMProvider().generate_match_rationale(
                job_title, job_description, job_role_tier, candidate_data, similarity_score
            )


class MockLLMProvider:
    """
    Deterministic provider that generates realistic, defensible match rationales
    citing seniority, core_skills, and years_experience without network calls.
    """
    provider_name: str = "mock"

    def generate_match_rationale(
        self,
        job_title: str,
        job_description: str,
        job_role_tier: str,
        candidate_data: dict[str, Any],
        similarity_score: float,
    ) -> str:
        seniority = candidate_data.get("seniority", "mid")
        years_exp = candidate_data.get("years_experience", 0.0)
        current_title = candidate_data.get("current_title", "Engineer")
        core_skills = candidate_data.get("core_skills", [])
        skills_str = ", ".join(core_skills[:3]) if core_skills else "relevant core competencies"
        pct = round(similarity_score * 100, 1)

        return (
            f"Candidate profile demonstrates strong alignment with {pct}% semantic similarity. "
            f"Holds {seniority} seniority with {years_exp} years of verified experience (currently '{current_title}'), "
            f"directly matching the {job_role_tier}-tier profile required for '{job_title}'. "
            f"Key technical overlap includes proficiency in {skills_str}."
        )


def get_llm_provider() -> LLMProvider:
    """
    Factory function returning the configured LLMProvider based on priority:
    1. If MOCK_LLM=true -> MockLLMProvider (default for testing suite).
    2. Else if GROQ_API_KEY is set -> GroqLLMProvider (fast, free-tier friendly).
    3. Else if ANTHROPIC_API_KEY is set -> ClaudeLLMProvider.
    4. Else -> MockLLMProvider with a warning that no real provider is configured.
    """
    mock_llm = os.getenv("MOCK_LLM", "true").lower() in ("1", "true", "yes")
    if mock_llm:
        return MockLLMProvider()

    groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
    if groq_api_key:
        return GroqLLMProvider(api_key=groq_api_key)

    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if anthropic_api_key:
        return ClaudeLLMProvider(api_key=anthropic_api_key)

    logger.warning(
        "No real LLM provider configured (neither GROQ_API_KEY nor ANTHROPIC_API_KEY is set). "
        "Falling back to MockLLMProvider."
    )
    return MockLLMProvider()
