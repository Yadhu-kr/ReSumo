# ReSumo 🚀
**AI-Driven Recruitment & Onboarding Automation Platform**

ReSumo streamlines talent acquisition through intelligent resume parsing, semantic RAG matching, tiered human-in-the-loop (HITL) approval workflows, and role-based access control.

---

## 🛠 Tech Stack

- **Backend:** FastAPI (Python 3.11+), SQLAlchemy, PostgreSQL, Alembic
- **Vector Search & AI:** ChromaDB, HuggingFace embeddings (`bge-large-en-v1.5`), Groq Cloud API / Anthropic Claude
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Radix UI / Shadcn
- **Authentication:** JWT Bearer tokens with Role-Based Access Control (Admin, Recruiter, Hiring Manager)
- **Containerization:** Docker & Docker Compose

---

## 🚀 Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Python 3.11+ (for local backend development)
- Node.js 18+ (for local frontend development)

### 2. Using Docker Compose
```bash
docker-compose up --build
```
- **Backend API:** `http://localhost:8000`
- **Interactive Swagger Docs:** `http://localhost:8000/docs`

### 3. Local Development

#### Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

#### Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

---

## 🔒 Security & Architecture
- Secrets and API keys are strictly loaded via environment variables (`.env`).
- Database migrations handled via Alembic.
- File uploads are validated by mime-type and size.
