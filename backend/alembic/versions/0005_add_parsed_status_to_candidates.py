"""Add parsed_status column to candidates table

Revision ID: 0005_add_parsed_status_to_candidates
Revises: 0004_auth_multitenancy
Create Date: 2026-09-15 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_add_parsed_status_to_candidates"
down_revision: Union[str, None] = "0004_auth_multitenancy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "candidates",
        sa.Column("parsed_status", sa.String(), nullable=True, server_default="uploaded"),
    )


def downgrade() -> None:
    op.drop_column("candidates", "parsed_status")
