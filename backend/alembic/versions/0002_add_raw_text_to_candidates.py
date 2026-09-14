"""Add raw_text column to candidates table

Revision ID: 0002_add_raw_text_to_candidates
Revises: 0001_initial_schema
Create Date: 2026-09-09 13:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002_add_raw_text_to_candidates"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("candidates", sa.Column("raw_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("candidates", "raw_text")
