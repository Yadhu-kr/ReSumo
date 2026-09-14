"""Add auth, multi-tenancy: companies, users, applications tables; restructure candidates, jobs, approvals

Revision ID: 0004_auth_multitenancy
Revises: 0003_approval_workflow
Create Date: 2026-09-10 09:00:00.000000

NOTE: This is a clean destructive migration. No production data exists yet.
      SQLite does not support DROP COLUMN < 3.35; tests use Base.metadata.create_all()
      and bypass Alembic, so this migration targets Postgres only.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_auth_multitenancy"
down_revision: Union[str, None] = "0003_approval_workflow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

uuid_type = postgresql.UUID(as_uuid=False).with_variant(sa.String(36), "sqlite")


def upgrade() -> None:
    # 1. Create companies table
    op.create_table(
        "companies",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # 2. Create users table
    op.create_table(
        "users",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("company_id", uuid_type, sa.ForeignKey("companies.id"), nullable=True),
        sa.Column("approver_role", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 3. Create applications table
    op.create_table(
        "applications",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("candidate_id", uuid_type, sa.ForeignKey("candidates.id"), nullable=False),
        sa.Column("job_id", uuid_type, sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=True, server_default="parsed"),
        sa.Column("similarity_score", sa.Float(), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("rationale_source", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # 4. Add company_id to jobs (nullable for migration, but required going forward)
    op.add_column(
        "jobs",
        sa.Column("company_id", uuid_type, sa.ForeignKey("companies.id"), nullable=True),
    )

    # 5. Add user_id to candidates
    op.add_column(
        "candidates",
        sa.Column("user_id", uuid_type, sa.ForeignKey("users.id"), nullable=True),
    )

    # 6. Remove job_id and status from candidates
    #    NOTE: Requires Postgres or SQLite >= 3.35.0
    op.drop_constraint("candidates_job_id_fkey", "candidates", type_="foreignkey")
    op.drop_column("candidates", "job_id")
    op.drop_column("candidates", "status")

    # 7. Replace candidate_id with application_id on approvals
    op.drop_constraint("approvals_candidate_id_fkey", "approvals", type_="foreignkey")
    op.drop_column("approvals", "candidate_id")
    op.add_column(
        "approvals",
        sa.Column("application_id", uuid_type, sa.ForeignKey("applications.id"), nullable=True),
    )

    # 8. Add acted_by_user_id to approvals
    op.add_column(
        "approvals",
        sa.Column("acted_by_user_id", uuid_type, sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade() -> None:
    # Reverse step 8: remove acted_by_user_id
    op.drop_column("approvals", "acted_by_user_id")

    # Reverse step 7: remove application_id, restore candidate_id
    op.drop_column("approvals", "application_id")
    op.add_column(
        "approvals",
        sa.Column("candidate_id", uuid_type, sa.ForeignKey("candidates.id"), nullable=False),
    )

    # Reverse step 6: restore job_id and status on candidates
    op.add_column(
        "candidates",
        sa.Column("status", sa.String(), nullable=True, server_default="uploaded"),
    )
    op.add_column(
        "candidates",
        sa.Column("job_id", uuid_type, sa.ForeignKey("jobs.id"), nullable=True),
    )

    # Reverse step 5: remove user_id from candidates
    op.drop_column("candidates", "user_id")

    # Reverse step 4: remove company_id from jobs
    op.drop_column("jobs", "company_id")

    # Reverse step 3: drop applications
    op.drop_table("applications")

    # Reverse step 2: drop users
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    # Reverse step 1: drop companies
    op.drop_table("companies")
