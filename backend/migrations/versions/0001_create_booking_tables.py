"""Create equipment, bookings, booking_items and booking_events

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # btree_gist lets one exclusion constraint compare equipment_id (=) and period (&&).
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.create_table(
        "bookings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booker_name", sa.String(length=80), nullable=False),
        sa.Column("purpose", sa.String(length=200), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bookings_booker_name"), "bookings", ["booker_name"], unique=False
    )
    op.create_table(
        "equipment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "booking_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("actor_name", sa.String(length=80), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_booking_events_booking_id"),
        "booking_events",
        ["booking_id"],
        unique=False,
    )
    op.create_table(
        "booking_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("period", postgresql.TSTZRANGE(), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "NOT isempty(period)", name="booking_items_period_not_empty"
        ),
        postgresql.ExcludeConstraint(
            (sa.column("equipment_id"), "="),
            (sa.column("period"), "&&"),
            where=sa.text("cancelled_at IS NULL"),
            using="gist",
            name="booking_items_no_overlap",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
        ),
        sa.ForeignKeyConstraint(
            ["equipment_id"],
            ["equipment.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_booking_items_booking_id"),
        "booking_items",
        ["booking_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_booking_items_booking_id"), table_name="booking_items")
    op.drop_table("booking_items")
    op.drop_index(op.f("ix_booking_events_booking_id"), table_name="booking_events")
    op.drop_table("booking_events")
    op.drop_table("equipment")
    op.drop_index(op.f("ix_bookings_booker_name"), table_name="bookings")
    op.drop_table("bookings")
