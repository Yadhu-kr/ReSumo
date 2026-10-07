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



def get_db():
    """FastAPI dependency that yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
