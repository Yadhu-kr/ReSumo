from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, resumes, candidates, jobs, approvals
from app.routers.approvals import seed_default_policies_if_empty
from app.routers.auth import seed_demo_users_if_empty
from app.database import SessionLocal


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Creates tables if missing and seeds default approval policies & demo users on startup."""
    try:
        from app.database import Base, engine
        from sqlalchemy import text
        Base.metadata.create_all(bind=engine)
        try:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN name TEXT"))
                conn.commit()
        except Exception:
            pass
        db = SessionLocal()
        seed_default_policies_if_empty(db)
        seed_demo_users_if_empty(db)
    except Exception as exc:
        print(f"Startup warning: {exc}")
    finally:
        try:
            db.close()
        except Exception:
            pass
    yield


app = FastAPI(
    title="AI-Driven Recruitment & Onboarding Automation API",
    description="Phase 1-3 + Auth: Resume Ingestion, RAG Matching, HITL Tiered Approval Workflows, JWT Authentication & Multi-Tenancy.",
    version="0.4.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(resumes.router)
app.include_router(candidates.router)
app.include_router(jobs.router)
app.include_router(approvals.router)


@app.get("/", tags=["root"])
def root():
    """Root endpoint providing service status and navigation links."""
    return {
        "service": "ReSumo AI Recruitment & Onboarding API",
        "status": "online",
        "version": "0.4.0",
        "docs_url": "/docs",
        "health_url": "/health",
    }


@app.get("/health", tags=["health"])
def health_check():
    """Liveness probe / health check."""
    return {"status": "ok"}
