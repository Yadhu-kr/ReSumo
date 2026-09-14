"""Initial schema for 5 core tables

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-09-09 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# UUID column definition compatible with both Postgres and SQLite
uuid_type = postgresql.UUID(as_uuid=False).with_variant(sa.String(36), "sqlite")


def upgrade() -> None:
    # 1. jobs
    op.create_table(
        "jobs",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("role_tier", sa.String(), nullable=False, server_default="junior"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # 2. candidates
    op.create_table(
        "candidates",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("job_id", uuid_type, sa.ForeignKey("jobs.id"), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("raw_resume_filename", sa.String(), nullable=False),
        sa.Column("parsed_data", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(), nullable=True, server_default="uploaded"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # 3. approvals
    op.create_table(
        "approvals",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("candidate_id", uuid_type, sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("approver_role", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=True, server_default="pending"),
        sa.Column("acted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # 4. offers
    op.create_table(
        "offers",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("candidate_id", uuid_type, sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("document_path", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # 5. interview_scores
    op.create_table(
        "interview_scores",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("candidate_id", uuid_type, sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("dimension", sa.String(), nullable=False),
        sa.Column("baseline_score", sa.Float(), nullable=True),
        sa.Column("finetuned_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("interview_scores")
    op.drop_table("offers")
    op.drop_table("approvals")
    op.drop_table("candidates")
    op.drop_table("jobs")
