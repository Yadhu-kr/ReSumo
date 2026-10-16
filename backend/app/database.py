"""
Database connection and session management.

Reads connection details from environment variables so it lines up
with the Postgres service defined in Phase 0's docker-compose.yml.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import logging
import socket

logger = logging.getLogger(__name__)

use_sqlite_flag = os.getenv("USE_SQLITE", "").strip().lower() in ("1", "true", "yes")

DATABASE_URL = os.getenv("DATABASE_URL")
if use_sqlite_flag:
    DATABASE_URL = "sqlite:///./recruitment.db"
elif not DATABASE_URL:
    try:
        with socket.create_connection(("localhost", 5432), timeout=0.5):
            DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/recruitment_db"
    except (OSError, socket.timeout):
        DATABASE_URL = "sqlite:///./recruitment.db"

# If postgres URL configured, test if it is genuinely reachable; fall back if offline
if DATABASE_URL.startswith("postgresql"):
    try:
        from urllib.parse import urlparse
        parsed = urlparse(DATABASE_URL)
        host = parsed.hostname or "localhost"
        port = parsed.port or 5432
        with socket.create_connection((host, port), timeout=0.5):
            pass
    except (OSError, socket.timeout) as exc:
        logger.warning(
            "Configured PostgreSQL database at %s:%s is unreachable (%s). Falling back to SQLite.",
            host,
            port,
            exc,
        )
        DATABASE_URL = "sqlite:///./recruitment.db"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema_compatibility(target_engine):
    """Ensures legacy SQLite tables have all columns added in later phases."""
    if not str(target_engine.url).startswith("sqlite"):
        return
    from sqlalchemy import text
    with target_engine.connect() as conn:
        try:
            # Check candidates table
            cand_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(candidates)")).fetchall()]
            if cand_cols and "parsed_status" not in cand_cols:
                conn.execute(text("ALTER TABLE candidates ADD COLUMN parsed_status VARCHAR DEFAULT 'uploaded'"))
                conn.commit()
            if cand_cols and "phone" not in cand_cols:
                conn.execute(text("ALTER TABLE candidates ADD COLUMN phone VARCHAR"))
                conn.commit()

            # Check users table
            user_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
            if user_cols and "name" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN name TEXT"))
                conn.commit()

            # Check offers table
            offer_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(offers)")).fetchall()]
            if offer_cols:
                needed = [
                    ("application_id", "VARCHAR(36)"),
                    ("role_title", "VARCHAR"),
                    ("salary", "FLOAT"),
                    ("currency", "VARCHAR DEFAULT 'USD'"),
                    ("start_date", "VARCHAR"),
                    ("equity", "VARCHAR"),
                    ("offer_letter_text", "TEXT"),
                    ("notes", "TEXT"),
                    ("responded_at", "DATETIME"),
                ]
                for col_name, col_type in needed:
                    if col_name not in offer_cols:
                        conn.execute(text(f"ALTER TABLE offers ADD COLUMN {col_name} {col_type}"))
                conn.commit()

            # Check interview_scores table
            score_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(interview_scores)")).fetchall()]
            if score_cols:
                score_needed = [
                    ("application_id", "VARCHAR(36)"),
                    ("interviewer_id", "VARCHAR(36)"),
                    ("interviewer_name", "VARCHAR"),
                    ("score", "FLOAT DEFAULT 3.0"),
                    ("recommendation", "VARCHAR"),
                    ("notes", "TEXT"),
                ]
                for col_name, col_type in score_needed:
                    if col_name not in score_cols:
                        conn.execute(text(f"ALTER TABLE interview_scores ADD COLUMN {col_name} {col_type}"))
                conn.commit()

            # Create any missing tables (like onboarding_tasks)
            Base.metadata.create_all(bind=target_engine)
        except Exception as e:
            logger.debug("Schema compatibility check note: %s", e)


ensure_schema_compatibility(engine)



def get_db():
    """FastAPI dependency that yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
