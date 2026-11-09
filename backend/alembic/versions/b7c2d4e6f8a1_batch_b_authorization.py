"""Batch B authorization: token version and membership consent

Revision ID: b7c2d4e6f8a1
Revises: dfba5c81f131
Create Date: 2026-11-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c2d4e6f8a1'
down_revision: Union[str, None] = 'dfba5c81f131'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('cooperative_memberships', sa.Column('consented_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('cooperative_memberships', 'consented_at')
    op.drop_column('users', 'token_version')