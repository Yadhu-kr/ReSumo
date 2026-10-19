"""
LLM Rationale Generation Service with swappable provider interface.

Defines an LLMProvider protocol and implementations:
- GroqLLMProvider: Calls Groq's OpenAI-compatible API using llama-3.1-8b-instant (fast & free-tier friendly).
- ClaudeLLMProvider: Calls Anthropic Claude API (claude-sonnet-5).
- MockLLMProvider: Deterministic local generator citing seniority, core_skills,
                   and years_experience without requiring live API keys.
"""
import os
import json
import logging
from typing import Protocol, Any, Optional

logger = logging.getLogger(__name__)


def _format_skill_list(skills: Any) -> str:
    if not skills or not isinstance(skills, (list, tuple)):
        return "None specified"
    cleaned = [str(s) for s in skills if s]
    return ", ".join(cleaned) if cleaned else "None specified"


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

    def generate_interview_questions(
        self,
        job_title: str,
        job_description: str,
        job_role_tier: str,
        candidate_data: dict[str, Any],
        round_type: str = "technical",
        custom_focus: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Generates structured interview questions tailored to candidate profile and role."""
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
- Seniority: {candidate_data.get('seniority') or 'Not specified'}
- Current Title: {candidate_data.get('current_title') or 'Not specified'}
- Years Experience: {candidate_data.get('years_experience') if candidate_data.get('years_experience') is not None else 'Not specified'}
- Core Skills: {_format_skill_list(candidate_data.get('core_skills'))}
- Secondary Skills: {_format_skill_list(candidate_data.get('secondary_skills'))}
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

    def generate_interview_questions(
        self,
        job_title: str,
        job_description: str,
        job_role_tier: str,
        candidate_data: dict[str, Any],
        round_type: str = "technical",
        custom_focus: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        prompt = f"""You are a principal technical interviewer preparing structured, rigorous interview questions for a hiring debrief.

Job Title: {job_title}
Role Tier: {job_role_tier}
Job Description: {job_description}
Interview Round: {round_type}
Custom Focus: {custom_focus or 'General Core Competency'}

Candidate Profile:
- Seniority: {candidate_data.get('seniority') or 'Not specified'}
- Years Experience: {candidate_data.get('years_experience') if candidate_data.get('years_experience') is not None else 'Not specified'}
- Core Skills: {_format_skill_list(candidate_data.get('core_skills'))}
- Domain: {candidate_data.get('primary_domain', 'Software Engineering')}
- Summary: {candidate_data.get('summary', '')}
- Key Accomplishments: {candidate_data.get('key_accomplishments', [])}

Generate 4 to 5 rigorous, tailored interview questions. Each question must evaluate the candidate's actual background and target role.
Return ONLY valid JSON matching this exact structure:
[
  {{
    "id": "q1",
    "category": "System Architecture / Technical Depth / Behavioral / Leadership",
    "question": "The question to ask candidate",
    "what_to_look_for": "Specific rubric indicators of what a strong answer contains vs red flags",
    "suggested_dimension": "technical_depth / system_design / communication / cultural_alignment / role_fit",
    "difficulty": "Junior / Mid / Senior / Staff",
    "rationale": "Why this question tests their background against the job requirements"
  }}
]"""
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
                    "content": "You are a technical interview evaluator. Output strict JSON only without markdown formatting.",
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1200,
            "temperature": 0.3,
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                raw = data["choices"][0]["message"]["content"].strip()
                if raw.startswith("```"):
                    lines = raw.split("\n")
                    raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
                return json.loads(raw)
        except Exception as exc:
            logger.warning("Groq question generation failed (%s). Falling back to MockLLMProvider.", exc)
            return MockLLMProvider().generate_interview_questions(
                job_title, job_description, job_role_tier, candidate_data, round_type, custom_focus
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
- Seniority: {candidate_data.get('seniority') or 'Not specified'}
- Current Title: {candidate_data.get('current_title') or 'Not specified'}
- Years Experience: {candidate_data.get('years_experience') if candidate_data.get('years_experience') is not None else 'Not specified'}
- Core Skills: {_format_skill_list(candidate_data.get('core_skills'))}
- Secondary Skills: {_format_skill_list(candidate_data.get('secondary_skills'))}
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

    def generate_interview_questions(
        self,
        job_title: str,
        job_description: str,
        job_role_tier: str,
        candidate_data: dict[str, Any],
        round_type: str = "technical",
        custom_focus: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        prompt = f"""You are a principal technical interviewer preparing structured, rigorous interview questions for a hiring debrief.

Job Title: {job_title}
Role Tier: {job_role_tier}
Job Description: {job_description}
Interview Round: {round_type}
Custom Focus: {custom_focus or 'General Core Competency'}

Candidate Profile:
- Seniority: {candidate_data.get('seniority') or 'Not specified'}
- Years Experience: {candidate_data.get('years_experience') if candidate_data.get('years_experience') is not None else 'Not specified'}
- Core Skills: {_format_skill_list(candidate_data.get('core_skills'))}
- Domain: {candidate_data.get('primary_domain', 'Software Engineering')}
- Summary: {candidate_data.get('summary', '')}
- Key Accomplishments: {candidate_data.get('key_accomplishments', [])}

Generate 4 to 5 rigorous, tailored interview questions. Each question must evaluate the candidate's actual background and target role.
Return ONLY valid JSON matching this exact structure:
[
  {{
    "id": "q1",
    "category": "System Architecture / Technical Depth / Behavioral / Leadership",
    "question": "The question to ask candidate",
    "what_to_look_for": "Specific rubric indicators of what a strong answer contains vs red flags",
    "suggested_dimension": "technical_depth / system_design / communication / cultural_alignment / role_fit",
    "difficulty": "Junior / Mid / Senior / Staff",
    "rationale": "Why this question tests their background against the job requirements"
  }}
]"""
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1200,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip()
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
            return json.loads(raw)
        except Exception as exc:
            logger.warning("Claude question generation failed (%s). Falling back to MockLLMProvider.", exc)
            return MockLLMProvider().generate_interview_questions(
                job_title, job_description, job_role_tier, candidate_data, round_type, custom_focus
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
        seniority = candidate_data.get("seniority")
        seniority_phrase = f"Holds {seniority} seniority " if seniority else "Demonstrates verified competence "
        years_exp = candidate_data.get("years_experience")
        exp_phrase = (
            f"with {years_exp} years of verified experience "
            if years_exp is not None
            else "with demonstrated domain experience "
        )
        current_title = candidate_data.get("current_title")
        title_phrase = f"(currently '{current_title}'), " if current_title else ""
        raw_skills = candidate_data.get("core_skills")
        core_skills = [str(s) for s in raw_skills] if isinstance(raw_skills, (list, tuple)) else []
        skills_str = ", ".join(core_skills[:3]) if core_skills else "relevant core competencies"
        pct = round(similarity_score * 100, 1)
        tier_phrase = f"{job_role_tier}-tier " if job_role_tier else ""

        return (
            f"Candidate profile demonstrates strong alignment with {pct}% semantic similarity. "
            f"{seniority_phrase}{exp_phrase}{title_phrase}"
            f"directly matching the {tier_phrase}profile required for '{job_title}'. "
            f"Key technical overlap includes proficiency in {skills_str}."
        )

    def generate_interview_questions(
        self,
        job_title: str,
        job_description: str,
        job_role_tier: str,
        candidate_data: dict[str, Any],
        round_type: str = "technical",
        custom_focus: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        seniority_raw = candidate_data.get("seniority") or job_role_tier or "Senior"
        seniority = str(seniority_raw).capitalize()
        if seniority.lower() == "none":
            seniority = "Senior"
        tier_label = f"{job_role_tier}-tier" if job_role_tier else "target"
        raw_skills = candidate_data.get("core_skills") or []
        core_skills = [str(s) for s in raw_skills] if isinstance(raw_skills, (list, tuple)) else []
        skill_1 = core_skills[0] if len(core_skills) > 0 else "Python"
        skill_2 = core_skills[1] if len(core_skills) > 1 else "PostgreSQL"
        skill_3 = core_skills[2] if len(core_skills) > 2 else "Docker"
        domain = candidate_data.get("primary_domain") or "Backend & Cloud Architecture"
        accomplishments = candidate_data.get("key_accomplishments") or []
        first_acc = accomplishments[0] if isinstance(accomplishments, list) and len(accomplishments) > 0 else "scaling distributed services and optimizing microservice latency"

        r_type = (round_type or "technical").lower()

        if r_type == "system_design":
            questions = [
                {
                    "id": "q1_arch_scale",
                    "category": "System Architecture & Scalability",
                    "question": f"Given your core background in {skill_1} and {domain}, how would you architect an end-to-end event-driven service for '{job_title}' that guarantees idempotent processing under 10x traffic bursts?",
                    "what_to_look_for": "Candidate should articulate message deduplication keys, dead-letter queues (DLQs), consumer partition rebalancing, and backpressure mechanisms.",
                    "suggested_dimension": "system_design",
                    "difficulty": seniority,
                    "rationale": f"Validates system design depth for {tier_label} expectations using candidate's stated skill '{skill_1}'."
                },
                {
                    "id": "q2_data_cache",
                    "category": "Data Modeling & Cache Consistency",
                    "question": f"When operating with {skill_2} and distributed caching layers, how do you mitigate cache stampedes, handle dual-write inconsistency, and execute zero-downtime schema migrations?",
                    "what_to_look_for": "Mentions read-through/write-through cache patterns, distributed mutexes, Change Data Capture (CDC), and expand/contract migration patterns.",
                    "suggested_dimension": "technical_depth",
                    "difficulty": seniority,
                    "rationale": f"Tests data layer reliability with {skill_2} in high-throughput environments."
                },
                {
                    "id": "q3_ha_failover",
                    "category": "High Availability & Disaster Recovery",
                    "question": f"For an enterprise service supporting '{job_title}', how would you design multi-region active-active vs active-passive failover while minimizing cross-region data replication lag?",
                    "what_to_look_for": "Demonstrates clear understanding of CAP theorem tradeoffs, split-brain prevention, DNS/Anycast failover, and asynchronous streaming replication.",
                    "suggested_dimension": "system_design",
                    "difficulty": seniority,
                    "rationale": "Evaluates strategic infrastructure resilience and outage tolerance."
                },
                {
                    "id": "q4_acc_profiling",
                    "category": "Production Accomplishment Deep Dive",
                    "question": f"In your resume you noted: '{first_acc}'. Can you walk us through the system bottlenecks you encountered, how you identified them, and the architectural tradeoffs you made?",
                    "what_to_look_for": "Validates hands-on ownership: candidate should provide quantitative profiling metrics, flame graphs or latency histograms, and explain how the fix was validated in staging.",
                    "suggested_dimension": "technical_depth",
                    "difficulty": seniority,
                    "rationale": "Directly probes verified resume accomplishments to ensure authenticity and technical ownership."
                },
            ]
        elif r_type == "behavioral":
            questions = [
                {
                    "id": "q1_conflict",
                    "category": "Technical Conflict & Influence",
                    "question": f"Tell us about a time when you strongly disagreed with an architectural proposal or engineering direction for a {domain} initiative. How did you build consensus without stalling delivery?",
                    "what_to_look_for": "Looks for constructive debate, evidence-driven prototyping, respectful peer engagement, and commitment to the team once a decision is finalized.",
                    "suggested_dimension": "communication",
                    "difficulty": seniority,
                    "rationale": "Assesses communication maturity and collaborative decision making under uncertainty."
                },
                {
                    "id": "q2_mentorship",
                    "category": "Mentorship & Engineering Culture",
                    "question": f"As a {seniority} engineer, how have you mentored junior team members or improved code review standards across your team?",
                    "what_to_look_for": "Specific examples of pairing, establishing documentation/linting standards, constructive PR reviews, and elevating overall team velocity.",
                    "suggested_dimension": "cultural_alignment",
                    "difficulty": seniority,
                    "rationale": "Evaluates leadership leverage and positive culture propagation."
                },
                {
                    "id": "q3_incident",
                    "category": "Incident Management & Accountability",
                    "question": "Describe a high-severity production outage or bug that you had to resolve under pressure. What was the root cause, and what blameless post-mortem actions did you implement?",
                    "what_to_look_for": "Accountability without blaming others, structured triage methodology, clear stakeholder communication, and prevention through automated tests/runbooks.",
                    "suggested_dimension": "role_fit",
                    "difficulty": seniority,
                    "rationale": "Tests composure, operational hygiene, and systems thinking during emergencies."
                },
                {
                    "id": "q4_prioritization",
                    "category": "Prioritization & Deadlines",
                    "question": f"When requirements change mid-sprint on a critical project for '{job_title}', how do you evaluate technical debt versus time-to-market tradeoffs?",
                    "what_to_look_for": "Clear scope negotiation, transparent risk communication to product management, and intentional debt tracking.",
                    "suggested_dimension": "communication",
                    "difficulty": seniority,
                    "rationale": "Tests practical business acumen and agile engineering judgment."
                },
            ]
        elif r_type == "executive":
            questions = [
                {
                    "id": "q1_exec_roadmap",
                    "category": "Strategic Technical Roadmap",
                    "question": f"If you joined as {job_title}, how would you evaluate our current technology stack ({skill_1}, {skill_2}) against 12-month business scale goals?",
                    "what_to_look_for": "Balances pragmatism against resume-driven development; assesses business ROI, maintainability, and hiring market accessibility.",
                    "suggested_dimension": "role_fit",
                    "difficulty": "Executive / Staff",
                    "rationale": "Assesses strategic alignment between technical decisions and business value."
                },
                {
                    "id": "q2_exec_slo",
                    "category": "Cross-functional Alignment & SLOs",
                    "question": "How do you align engineering reliability and refactoring initiatives with product roadmap priorities that demand immediate feature releases?",
                    "what_to_look_for": "Uses Service Level Objectives (SLOs), error budgets, and business risk quantification to justify technical investments.",
                    "suggested_dimension": "communication",
                    "difficulty": "Executive / Staff",
                    "rationale": "Tests ability to interface with executive leadership and product stakeholders."
                },
                {
                    "id": "q3_exec_migration",
                    "category": "Architecture Evolution & Modernization",
                    "question": f"Can you share an experience where you led a major migration or modernization across services in {domain}? How did you manage risk and minimize client disruption?",
                    "what_to_look_for": "Discusses strangler fig pattern, canary traffic shifting, backward compatibility, and feature flags.",
                    "suggested_dimension": "system_design",
                    "difficulty": "Executive / Staff",
                    "rationale": "Probes large-scale execution oversight and enterprise change management."
                },
                {
                    "id": "q4_exec_bar",
                    "category": "Engineering Excellence & Quality Bar",
                    "question": "How do you define and enforce the technical bar for hiring and promoting engineers within your discipline?",
                    "what_to_look_for": "Objective rubric design, bias minimization, consistent candidate experience, and proactive talent pipeline development.",
                    "suggested_dimension": "cultural_alignment",
                    "difficulty": "Executive / Staff",
                    "rationale": "Assesses talent development philosophy and governance."
                },
            ]
        else:
            # Default: Technical Deep Dive
            questions = [
                {
                    "id": "q1_concurrency",
                    "category": "Core Language & Concurrency",
                    "question": f"In {skill_1}, how do you manage concurrency, thread safety, and asynchronous I/O? What pitfalls (e.g. event loop blocking, memory leaks) have you debugged in production?",
                    "what_to_look_for": "Deep mastery of the runtime: understands GIL/asyncio/threading models, connection pooling, and non-blocking asynchronous execution.",
                    "suggested_dimension": "technical_depth",
                    "difficulty": seniority,
                    "rationale": f"Validates proficiency in {skill_1} as a primary job requirement."
                },
                {
                    "id": "q2_resilience",
                    "category": "System Architecture & Resilience",
                    "question": f"How would you design a fault-tolerant backend service using {skill_1} and {skill_2} that incorporates circuit breakers, rate limiting, and graceful degradation?",
                    "what_to_look_for": "Mentions token bucket or leaky bucket algorithms, retry policies with exponential backoff and jitter, and fallback responses.",
                    "suggested_dimension": "system_design",
                    "difficulty": seniority,
                    "rationale": f"Evaluates production-readiness combining {skill_1} and {skill_2}."
                },
                {
                    "id": "q3_accomplishment",
                    "category": "Production Accomplishment Deep Dive",
                    "question": f"Regarding your verified achievement: '{first_acc}', what specific profiling tools, benchmarks, and architectural changes did you use to deliver those results?",
                    "what_to_look_for": "Candidate should explain before-and-after metrics, specific query/code optimizations, and how they validated stability under peak load.",
                    "suggested_dimension": "technical_depth",
                    "difficulty": seniority,
                    "rationale": "Directly probes verified resume accomplishments to ensure authenticity."
                },
                {
                    "id": "q4_testing_ops",
                    "category": "Testing, Observability & CI/CD",
                    "question": f"When building services with {skill_3} in {domain}, what is your testing pyramid and deployment verification strategy before reaching production?",
                    "what_to_look_for": "Integration testing strategies, test containers, automated smoke tests, telemetry instrumentation (logs, metrics, traces), and zero-downtime rolling deploys.",
                    "suggested_dimension": "role_fit",
                    "difficulty": seniority,
                    "rationale": f"Ensures software lifecycle maturity and release discipline with {skill_3}."
                },
            ]

        if custom_focus and custom_focus.strip():
            focus_clean = custom_focus.strip()
            questions.append({
                "id": "q5_custom_focus",
                "category": f"Custom Focus: {focus_clean[:30]}",
                "question": f"Focusing specifically on '{focus_clean}': Walk us through your hands-on approach, edge cases, and design considerations for '{job_title}'.",
                "what_to_look_for": f"Candidate provides concrete implementation details, tradeoffs, and failure mitigation strategies regarding {focus_clean}.",
                "suggested_dimension": "technical_depth",
                "difficulty": seniority,
                "rationale": f"Interviewer customized focus topic: {focus_clean}."
            })

        return questions



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
