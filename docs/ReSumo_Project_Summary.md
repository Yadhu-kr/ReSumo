# ReSumo: Comprehensive Project Architecture & Technical Summary Specification

**ReSumo** is an enterprise-grade, AI-driven recruitment and onboarding automation platform designed to eliminate hiring friction, prevent resume hallucination, and replace black-box screening algorithms with mathematically grounded semantic matching and strict Human-in-the-Loop (HITL) governance.

---

## 1. Project Metadata & Academic Credits

- **Project Title:** ReSumo — AI-Driven Recruitment & Onboarding Automation with Human-in-the-Loop Approval
- **Course & Department:** CSD 415 — Project Evaluation, Department of Computer Science & Engineering
- **Faculty Supervisor:** Dr. Sumod Sundar (Associate Dean, Department of Computer Science)
- **Project Authors:**
  - Niya Susan Rajeev (PRC23CS074)
  - Murali Krishnan R (PRC23CS070)
  - Yadhu Krishnan R (PRC23CS088)
  - Jan Cherian Thomas (PRC23CS052)
- **Evaluation Date:** October 2026
- **Current Version:** v0.6.0 (Phases 1–5 Complete + Multi-Tenancy + RBAC)

---

## 2. Problem Statement & Core Design Principles

Traditional Applicant Tracking Systems (ATS) suffer from critical architectural and operational bottlenecks:
1. **Keyword Rigidity & False Rejections:** Brittle rule-based keyword matchers penalize qualified candidates who use synonyms, alternative phrasing, or non-linear career trajectories.
2. **Generalist LLM Hallucination & Verbosity:** Off-the-shelf commercial LLMs frequently hallucinate skills or employers, emit conversational filler (which crashes strict downstream JSON decoders), and drift from required schema keys.
3. **Black-Box Autonomous Bias:** Autonomous algorithmic filtering introduces legal, regulatory, and ethical compliance risks by rejecting candidates without explanation or human oversight.
4. **Disconnected Fragmented Systems:** Ingestion, screening, technical interviews, offer management, and onboarding typically operate across disconnected tools, leading to administrative overhead.

### ReSumo's Architectural Solutions
- **Domain-Specific Fine-Tuned Extraction with LoRA:** Fine-tuned on 5,000 human-verified resumes to force strict output compliance to a 15-key JSON schema with zero conversational filler and no hallucination.
- **Dense Vector Semantic Matching (RAG):** Evaluates contextual conceptual overlap using 1,024-dimensional dense semantic vectors (`BAAI/bge-large-en-v1.5`) in Cosine Metric Space rather than keyword matching.
- **Explainable AI (XAI) Match Rationales:** AI never produces an isolated number; every match score is accompanied by an evidence-grounded justification breaking down technical alignment and specific skill gaps.
- **Deterministic Multi-Tier HITL Governance:** AI operates strictly as a decision-support copilot. Candidate progression requires explicit hierarchical human sign-off calibrated to role seniority.
- **Unified Lifecycle Orchestration:** Seamless continuous state progression from resume ingestion, parsing, RAG matching, approval, AI interview questioning, rubric scoring, offer generation, to 5-pillar onboarding automation.

---

## 3. End-to-End 10-Stage Technical Pipeline

```
[Resume Upload] (PDF / DOCX / Scanned Images)
       │
       ▼
[Stage 01: Security Gateway] ──> Enforce 5MB limit, MIME verification, atomic UUIDv4 write
       │
       ▼
[Stage 02: Ingestion & OCR] ───> pypdf / python-docx (Fallback: Tesseract v5 OCR if <10 words)
                                 Deterministic contact regex (Name, Email, Phone, Links)
       │
       ▼
[Stage 03: LoRA Fine-Tuned] ───> Qwen2.5 Causal LM fine-tuned with LoRA (Low-Rank Adaptation)
                                 Strict 15-key JSON schema output (sandeeppanem 5K contract)
       │
       ▼
[Stage 04: PostgreSQL ACID] ───> Relational storage in `candidates` table (JSONB `parsed_data`)
       │
       ▼
[Stage 05: Dense Embedding] ───> BAAI/bge-large-en-v1.5 (1,024 dimensions, L2 normalized)
                                 Encodes locked 10-field structured representation string
       │
       ▼
[Stage 06: Vector Indexing] ───> ChromaDB Persistent Vector Store (HNSW graph in Cosine Space)
                                 Fallback path: raw plain text embedded on corrupt resumes
       │
       ▼
[Stage 07: Job Requisition] ───> HR posts role; JD embedded into 1,024-dim query vector (q)
       │
       ▼
[Stage 08: Semantic Match &] ──> Cosine similarity ranking: Match % = (1 - Distance) * 100
  [Explainable AI (XAI)]         Grounded LLM produces detailed match rationale citing evidence
       │
       ▼
[Stage 09: Tiered HITL] ───────> Seniority-based approval state machine (Junior/Mid -> HM,
                                 Senior/Lead -> VP/Director, Exec -> CEO)
       │
       ▼
[Stage 10: Interview &] ───────> Tailored technical & STAR behavioral questions + 5D rubrics
  [Automated Onboarding]         Offer letter issuance + 5-Pillar onboarding task tracking
```

---

## 4. In-Depth Pipeline Stage Breakdown

### Stage 1: Document Upload & Security Gateway
- **Endpoint:** `POST /api/resumes/upload-resume`
- **Validation:** Strict MIME-type checking (`.pdf`, `.docx`, `.png`, `.jpg`, `.jpeg`) with a 5MB payload limit to prevent buffer exhaustion and denial-of-service attacks.
- **Storage:** Writes to an isolated disk directory (`uploads/resumes/<uuid>.<ext>`) with an unguessable UUIDv4 file identifier to prevent path traversal and file collisions.

### Stage 2: Dual-Mode Text Extraction & OCR Fallback
- **Text Parser:** Reads programmatic text using `pypdf` or `python-docx`.
- **Heuristic OCR Trigger:** If extracted text contains fewer than 10 words (indicating a scanned photocopy, flattened image PDF, or rasterized graphic), the engine automatically triggers **Tesseract v5 OCR** combined with PIL image binarization and contrast enhancement.
- **Deterministic Contact Extraction:** Uses regex patterns to isolate Name, Email, Phone number, and external portfolio links (LinkedIn, GitHub). This separates PII extraction from the semantic LLM, preventing hallucination.
- **Database Entry:** A `Candidate` record is inserted with `parsed_status = 'uploaded'`.

### Stage 3: Domain-Specific Extraction via LoRA Fine-Tuning
- **Foundation Model:** **Qwen2.5** Causal Language Model.
- **Parameter Adaptation:** **LoRA (Low-Rank Adaptation)**. Freezes the base transformer weights and injects low-rank trainable decomposition matrices ($W = W_0 + \Delta W$, where $\Delta W = B \cdot A$ with rank $r=16$) into the multi-head attention projection layers ($W_q, W_k, W_v, W_o$).
- **Dataset:** `sandeeppanem/resume-json-extraction-5k` from Hugging Face — 5,000 real-world resumes paired with human-verified 15-key ground truth JSON extractions.
- **Data Preprocessing:** Custom `clean_html` pipeline strips erratic HTML/DOM markup, normalizes character encoding, unescapes entities, and cleans whitespace.
- **Training Objective:** Cross-Entropy Loss computed strictly over target JSON tokens:
  $$\mathcal{L}_{\text{LoRA}}(\Theta) = -\sum_{t=1}^{T} \log P(y_t \mid y_{<t}, x_{\text{resume}}; \Theta)$$
- **Local Deployment & Privacy:** Quantized to 8-bit GGUF format (`resume-parser-q8_0.gguf`) running locally via LM Studio or `llama-server` (Ports 1234/8001). Zero candidate personal information leaves the local enterprise environment, ensuring GDPR and data privacy compliance.
- **Asynchronous Execution:** Wrapped in Starlette's `run_in_threadpool()` so local inference does not block FastAPI’s asynchronous event loop.

#### The 15-Key JSON Schema Contract
```json
{
  "current_title": "string",
  "previous_titles": ["string", "..."],
  "current_company": "string",
  "previous_companies": ["string", "..."],
  "years_experience": 5.5,
  "seniority": "junior | mid | senior | lead | principal",
  "primary_domain": "string",
  "industries": ["string", "..."],
  "core_skills": ["string", "..."],
  "secondary_skills": ["string", "..."],
  "tools": ["string", "..."],
  "leadership_experience": true,
  "key_achievements": ["string", "..."],
  "location": "string | null",
  "summary": "string (max 300 chars)"
}
```
*Rule: If a field is not present in the resume, the model outputs `null` or `[]`. It never fabricates facts.*

#### Swappable Extraction Provider Architecture
1. `FineTunedExtractionProvider`: Direct local model execution with LoRA weights via `transformers` and `peft`.
2. `QwenExtractionProvider`: OpenAI-compatible local HTTP client calling local servers (LM Studio / `llama-server`) with JSON validation and retry handling.
3. `GroqExtractionProvider`: High-speed cloud fallback using `llama-3.3-70b-versatile` with native JSON mode.
4. `RemoteExtractionProvider`: Generic OpenAI-compatible remote endpoint (e.g., self-hosted GPU node).
5. `MockExtractionProvider`: Deterministic, schema-compliant mock generator for unit tests and local frontend UI development.

### Stage 4: Relational State Persistence (PostgreSQL)
- The validated JSON is parsed into Pydantic v2 schemas (`ParsedResumeData`).
- Stored in the `candidates` table under the `parsed_data` JSONB column with `parsed_status = 'parsed'`.
- All operations are scoped to a multi-tenant `Company` entity to guarantee tenant data isolation.

### Stage 5: Dense Vector Embedding Engine
- **Embedding Model:** `BAAI/bge-large-en-v1.5` producing 1,024-dimensional dense semantic vectors.
- **Deterministic 10-Field Representation String:** To prevent narrative filler words from diluting semantic weight, the system formats the candidate profile into a structured template:
  ```
  Current Title: {current_title}
  Previous Titles: {previous_titles}
  Primary Domain: {primary_domain}
  Industries: {industries}
  Core Skills: {core_skills}
  Secondary Skills: {secondary_skills}
  Tools: {tools}
  Years Experience: {years_experience}
  Seniority: {seniority}
  Summary: {summary}
  ```
- **L2 Vector Normalization:** Every embedding is normalized to unit Euclidean sphere length:
  $$\|v\|_2 = 1.0 \implies \sqrt{\sum_{i=1}^{1024} v_i^2} = 1.0$$
  This makes vector dot products mathematically equivalent to Cosine Similarity.

### Stage 6: Vector Indexing & Storage (ChromaDB)
- Uses ChromaDB's persistent client with an **HNSW (Hierarchical Navigable Small World)** graph index configured in Cosine Metric Space (`{"hnsw:space": "cosine"}`).
- Provides logarithmic $O(\log N)$ approximate nearest-neighbor retrieval.
- **Corrupt File Fallback Path:** If a resume is heavily corrupted or Stage 3 extraction fails, ReSumo transitions the record to `parsed_status = 'extraction_failed'` and embeds the raw extracted plaintext directly into ChromaDB. The candidate remains searchable in semantic job matching.

### Stage 7: Job Requisition Vectorization
- When a job is posted (title, role tier, technical requirements, description), the requisition is formatted and embedded into a 1,024-dimensional query vector $\mathbf{q}$ using the same `bge-large-en-v1.5` model and stored in the ChromaDB `jobs` collection.

### Stage 8: Semantic Matching & Explainable AI (XAI)
- **Mathematical Distance & Match Percentage:** ChromaDB computes the Cosine Distance:
  $$\text{Cosine Distance} = 1.0 - \frac{\mathbf{q} \cdot \mathbf{d}_i}{\|\mathbf{q}\|_2 \|\mathbf{d}_i\|_2}$$
  The candidate match percentage is calculated as:
  $$\text{Match \%} = (1.0 - \text{Cosine Distance}) \times 100\%$$
- **Grounding & XAI Rationale:** The matched candidate profile and job requirements are passed to an LLM generator (`GroqLLMProvider`, `ClaudeLLMProvider`, or `BionicLLMProvider`) with strict grounding directives. The model outputs a bulleted justification detailing:
  - Technical Overlap: Exact match between candidate skills/tools and job requirements.
  - Seniority Alignment: Evaluation of candidate years of experience vs. job tier.
  - Skill Gaps & Trade-offs: Specific missing technologies or competencies.

### Stage 9: Tiered Human-in-the-Loop (HITL) Governance
ReSumo enforces a strict non-autonomous policy: AI suggests and ranks, but only authorized human leaders can advance a candidate. The state machine transitions applications through:
$$\text{parsed} \longrightarrow \text{shortlisted} \longrightarrow \text{pending\_approval} \longrightarrow \text{approved} \lor \text{rejected}$$

#### Seniority Escalation Policy Matrix
| Candidate Seniority Tier | Required Approver Role | Evaluation Focus |
|---|---|---|
| **Junior / Mid** | Hiring Manager (HM) | Technical skill overlap, core competencies, portfolio validation |
| **Senior / Lead** | Engineering Director / VP | System design breadth, architectural leadership, team budget |
| **Principal / Executive** | Chief Executive Officer (CEO) | Organizational vision, strategic alignment, executive compensation |

### Stage 10: Dynamic Interview Console & 5-Pillar Onboarding

#### Dynamic Interview Question Generator
Generates customized interview questions tailored to the candidate's exact profile gaps:
- **Technical Track:** Deep architecture, scalability, concurrency, and distributed systems questions.
- **HR & Culture Fit Track:** Behavioral interview questions formulated using the **STAR methodology** (Situation, Task, Action, Result) covering:
  - Values & Cultural Alignment (ownership, adaptability, ethics)
  - Interpersonal Communication & Feedback
  - Collaboration & Conflict Resolution
  - Work Ethic & Accountability
  - Role Motivation & Expectations

#### 5-Dimension Rubric Scorecards
Interviewers grade candidates on a 1.0 to 5.0 scale across 5 dimensions:
1. `technical_depth`
2. `communication`
3. `role_fit`
4. `system_design`
5. `cultural_alignment`

The platform automatically computes average composite scores and multi-interviewer consensus with recommendations (`strong_hire`, `hire`, `lean_hire`, `lean_no_hire`, `no_hire`).

#### Automated Offer Generation
- Generates formal offer letters with compensation, equity, start dates, and currency.
- Manages lifecycle statuses: `draft` $\to$ `sent` $\to$ `accepted` $\to$ `declined` $\to$ `rescinded`.

#### 5-Pillar Operational Onboarding Tracker
Upon offer acceptance, ReSumo initializes and tracks 5 operational onboarding pillars:
1. **IT & Hardware Provisioning:** Workstation procurement, corporate email, VPN access, and credentials.
2. **Legal & Compliance:** NDA signing, intellectual property agreements, and background verification.
3. **Banking & Payroll:** Tax documentation (W-4 / Form 16), direct deposit, and statutory filings.
4. **Corporate Orientation:** Company handbook review, security compliance training, and mentor assignment.
5. **HRMS Profile Integration:** Employee master record creation and internal system enrollment.

Each task has due dates, completion timestamps, verification checks, and structured JSON form payloads.

---

## 5. Relational Data Models & Database Schema

The database architecture is built on PostgreSQL (with SQLite compatibility for testing) using SQLAlchemy ORM and Alembic migrations.

```
┌──────────────┐       1:N       ┌──────────────┐       1:N       ┌──────────────┐
│   Company    ├────────────────►│     User     ├────────────────►│ AccountLog   │
└──────┬───────┘                 └──────┬───────┘                 └──────────────┘
       │ 1:N                            │ 1:1 (optional)
       │                                ▼
       │                         ┌──────────────┐       1:N       ┌──────────────┐
       ├────────────────────────►│  Candidate   ├────────────────►│CandidateNote │
       │                         └──────┬───────┘                 └──────────────┘
       │ 1:N                            │ 1:N
       ▼                                ▼
┌──────────────┐       1:N       ┌──────────────┐
│     Job      ├────────────────►│ Application  │
└──────────────┘                 └───┬───┬──┬───┘
                                     │   │  │
         ┌───────────────────────────┘   │  └────────────────────────────┐
         ▼ 1:N                           ▼ 1:N                           ▼ 1:N
  ┌──────────────┐                ┌──────────────┐                ┌──────────────┐
  │   Approval   │                │    Offer     │                │InterviewScore│
  └──────────────┘                └──────────────┘                └──────────────┘
                                         │ 1:N                           │ 1:N
                                         ▼                               ▼
                                  ┌──────────────┐                ┌──────────────┐
                                  │OnboardingTask│                │InterviewSched│
                                  └──────────────┘                └──────────────┘
```

### Complete Entity Breakdown (14 Models)
1. **`Company`**: Multi-tenant container (`id`, `name`, `created_at`).
2. **`User`**: System identities with RBAC (`id`, `email`, `name`, `password_hash`, `role`, `secondary_roles`, `company_id`, `approver_role`).
3. **`Job`**: Requisitions (`id`, `title`, `description`, `role_tier`, `company_id`, `created_at`).
4. **`Candidate`**: Applicant profiles (`id`, `user_id`, `name`, `email`, `phone`, `raw_resume_filename`, `raw_text`, `parsed_data` [JSONB], `parsed_status`).
5. **`Application`**: Candidate-to-Job bridge (`id`, `candidate_id`, `job_id`, `status`, `similarity_score`, `rationale`, `rationale_source`).
6. **`Approval`**: State machine audit node (`id`, `application_id`, `approver_role`, `step_order`, `action`, `notes`, `acted_by_user_id`, `acted_at`).
7. **`ApprovalPolicy`**: Escalation rules (`id`, `role_tier`, `step_order`, `approver_role`).
8. **`Offer`**: Financial and contractual packages (`id`, `candidate_id`, `application_id`, `role_title`, `salary`, `currency`, `equity`, `status`, `document_path`).
9. **`InterviewScore`**: Rubric evaluations (`id`, `candidate_id`, `application_id`, `interviewer_id`, `dimension`, `interview_type`, `score`, `recommendation`, `notes`).
10. **`OnboardingTask`**: 5-pillar tasks (`id`, `candidate_id`, `application_id`, `company_id`, `title`, `category`, `status`, `due_days`, `form_data`).
11. **`InterviewSchedule`**: Calendar events (`id`, `company_id`, `job_id`, `candidate_id`, `interviewer_id`, `title`, `round_type`, `start_time`, `end_time`, `meeting_link`, `status`).
12. **`Notification`**: Real-time communication (`id`, `user_id`, `recipient_email`, `subject`, `body_text`, `notification_type`, `is_read`, `delivery_status`).
13. **`CandidateNote`**: Internal recruiter/interviewer collaboration notes (`id`, `candidate_id`, `author_id`, `author_name`, `author_role`, `content`).
14. **`AccountLog`**: Enterprise audit trail for compliance (`id`, `company_id`, `admin_id`, `target_user_id`, `action`, `details`).

---

## 6. Frontend Architecture & Role-Based Portals

The frontend is constructed using **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Radix UI / Shadcn UI**. It features client-side route protection, JWT state synchronization, and role-adaptive layouts.

### User Portals & Feature Views
1. **Recruiter Pipeline Dashboard (`PipelineDashboardPage.tsx`):**
   - Interactive Kanban board tracking candidates through ingestion, screening, interview, offer, and hire stages.
   - Quick filters by job requisition, seniority, and match score.
2. **Recruiter Candidate Dossier (`CandidateDossierPage.tsx`):**
   - 360-degree candidate packet displaying structured 15-key resume data, contact metadata, similarity score, XAI match rationale, and evaluation history.
3. **Approvals & Governance Portal (`ApprovalsPage.tsx`):**
   - Dedicated console for Hiring Managers, VPs, and the CEO.
   - Summarizes applicant qualifications, match rationale, and salary bounds with one-click Approve, Reject, or Escalate actions.
4. **Interviewer Console (`InterviewerConsolePage.tsx`):**
   - Live interview workspace featuring dynamic AI question generation (Technical and HR/Behavioral tracks).
   - 5-dimension interactive rubric scorecards and debrief notes.
5. **Candidate Self-Service Portal (`CandidatePortalPage.tsx` & `CandidateJobsPage.tsx`):**
   - Enables applicants to search open requisitions, submit resumes, monitor application status in real time, view scheduled interviews, sign offer letters, and complete 5-pillar onboarding tasks.
6. **Administrator Console (`AdminConsolePage.tsx`):**
   - Enterprise administration: user creation, secondary role assignment, approval policy customization, and immutable audit logs (`AccountLog`).

---

## 7. Security, Privacy & Compliance Architecture

- **Role-Based Access Control (RBAC):** Hierarchical permissions enforced via JWT Bearer tokens and FastAPI route dependencies. Supports `admin`, `hr`, `approver`, `interviewer`, and `candidate`, augmented by `secondary_roles` for cross-functional staff.
- **Tenant Isolation:** Every job, application, candidate note, and onboarding task is tagged with a `company_id`, ensuring strict tenant data separation.
- **Local AI & Data Sovereignty:** Resume parsing runs on local quantized GGUF models via LoRA without sending confidential candidate PII to external APIs.
- **Fail-Safe Robustness:** If local model servers or external APIs experience transport timeouts, the backend falls back to deterministic mock generators or raw plaintext vector indexing so operations are never blocked.
- **Audit Logging & Reproducibility:** Every administrative user modification, approval decision, and interview evaluation generates an immutable audit record with timestamps and user IDs.

---

## 8. Summary of Technologies

| Layer | Technologies |
|---|---|
| **Backend Framework** | FastAPI (Python 3.11+), Starlette, Uvicorn, Pydantic v2 |
| **Relational Database** | PostgreSQL, SQLAlchemy ORM, Alembic migrations, SQLite (testing) |
| **Vector Database** | ChromaDB (Persistent client, HNSW graph index, Cosine metric space) |
| **Embedding Engine** | `BAAI/bge-large-en-v1.5` via SentenceTransformers (1,024 dimensions, L2 normalized) |
| **Resume Parser LLM** | Qwen2.5 fine-tuned with **LoRA (Low-Rank Adaptation)** on `sandeeppanem/5k` |
| **Serving & Quantization** | 8-bit GGUF via `llama-server` / LM Studio (Local, zero external PII leakage) |
| **XAI & Interview LLMs** | Groq Cloud API (`llama-3.1-8b`, `llama-3.3-70b`), Anthropic Claude (`claude-sonnet-5`), Bionic local LLM |
| **OCR & Document Parsing**| `pypdf`, `python-docx`, Tesseract v5 OCR, Pillow image binarization |
| **Frontend Framework** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Radix UI |
| **Authentication & Auth** | OAuth2 Password Bearer, JWT tokens, bcrypt password hashing |
| **DevOps & Containers** | Docker, Docker Compose, automated database seeding |
