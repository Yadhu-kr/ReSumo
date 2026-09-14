"""Create approval_policies table and update approvals table for tiered workflow

Revision ID: 0003_approval_workflow
Revises: 0002_add_raw_text_to_candidates
Create Date: 2026-09-09 14:00:00.000000

"""
import uuid
from typing import Sequence, Union
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_approval_workflow"
down_revision: Union[str, None] = "0002_add_raw_text_to_candidates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

uuid_type = postgresql.UUID(as_uuid=False).with_variant(sa.String(36), "sqlite")


def upgrade() -> None:
    # 1. Create approval_policies table
    approval_policies_table = op.create_table(
        "approval_policies",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("role_tier", sa.String(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("approver_role", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # 2. Add step_order and notes to approvals table
    op.add_column(
        "approvals",
        sa.Column("step_order", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "approvals",
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # 3. Seed default approval policies
    now = datetime.now(timezone.utc)
    op.bulk_insert(
        approval_policies_table,
        [
            {
                "id": str(uuid.uuid4()),
                "role_tier": "junior",
                "step_order": 1,
                "approver_role": "hiring_manager",
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "role_tier": "mid",
                "step_order": 1,
                "approver_role": "hiring_manager",
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "role_tier": "senior",
                "step_order": 1,
                "approver_role": "director",
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "role_tier": "senior",
                "step_order": 2,
                "approver_role": "vp",
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "role_tier": "exec",
                "step_order": 1,
                "approver_role": "ceo",
                "created_at": now,
            },
        ],
    )


def downgrade() -> None:
    op.drop_column("approvals", "notes")
    op.drop_column("approvals", "step_order")
    op.drop_table("approval_policies")
