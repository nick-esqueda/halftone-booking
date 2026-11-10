"""Create users and link bookings and their history to them

Every distinct booker or actor name already in the database becomes a user,
so no booking is lost. Names are matched case-insensitively; the spelling
seen first wins. After the links are filled in, the free-text name columns
are dropped: a booking's name now comes from its user.

There is no password column on purpose. Passwords arrive in a later project.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

USERNAME_INDEX_NAME = "users_username_lower_key"

# Every name used so far, with the time it was first used.
BACKFILL_USERS_SQL = """
INSERT INTO users (username, created_at)
SELECT DISTINCT ON (lower(name)) name, first_used_at
FROM (
    SELECT booker_name AS name, created_at AS first_used_at FROM bookings
    UNION ALL
    SELECT actor_name AS name, created_at AS first_used_at FROM booking_events
) AS used_names
ORDER BY lower(name), first_used_at
"""

LINK_BOOKINGS_SQL = """
UPDATE bookings SET user_id = users.id
FROM users WHERE lower(users.username) = lower(bookings.booker_name)
"""

LINK_EVENTS_SQL = """
UPDATE booking_events SET actor_user_id = users.id
FROM users WHERE lower(users.username) = lower(booking_events.actor_name)
"""

RESTORE_BOOKER_NAMES_SQL = """
UPDATE bookings SET booker_name = users.username
FROM users WHERE users.id = bookings.user_id
"""

RESTORE_ACTOR_NAMES_SQL = """
UPDATE booking_events SET actor_name = users.username
FROM users WHERE users.id = booking_events.actor_user_id
"""


def upgrade() -> None:
    create_users_table()
    op.execute(BACKFILL_USERS_SQL)
    link_bookings_to_users()
    link_events_to_users()


def downgrade() -> None:
    restore_booker_names()
    restore_actor_names()
    op.drop_index(USERNAME_INDEX_NAME, table_name="users")
    op.drop_table("users")


def create_users_table() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    # "Sam K" and "sam k" are the same person, so uniqueness ignores case.
    op.create_index(
        USERNAME_INDEX_NAME, "users", [sa.text("lower(username)")], unique=True
    )


def link_bookings_to_users() -> None:
    op.add_column("bookings", sa.Column("user_id", sa.Integer(), nullable=True))
    op.execute(LINK_BOOKINGS_SQL)
    op.alter_column("bookings", "user_id", nullable=False)
    op.create_foreign_key(
        "bookings_user_id_fkey", "bookings", "users", ["user_id"], ["id"]
    )
    op.create_index(op.f("ix_bookings_user_id"), "bookings", ["user_id"])
    op.drop_index(op.f("ix_bookings_booker_name"), table_name="bookings")
    op.drop_column("bookings", "booker_name")


def link_events_to_users() -> None:
    new_column = sa.Column("actor_user_id", sa.Integer(), nullable=True)
    op.add_column("booking_events", new_column)
    op.execute(LINK_EVENTS_SQL)
    op.alter_column("booking_events", "actor_user_id", nullable=False)
    op.create_foreign_key(
        "booking_events_actor_user_id_fkey",
        "booking_events",
        "users",
        ["actor_user_id"],
        ["id"],
    )
    op.drop_column("booking_events", "actor_name")


def restore_booker_names() -> None:
    name_column = sa.Column("booker_name", sa.String(length=80), nullable=True)
    op.add_column("bookings", name_column)
    op.execute(RESTORE_BOOKER_NAMES_SQL)
    op.alter_column("bookings", "booker_name", nullable=False)
    op.create_index(op.f("ix_bookings_booker_name"), "bookings", ["booker_name"])
    op.drop_index(op.f("ix_bookings_user_id"), table_name="bookings")
    op.drop_constraint("bookings_user_id_fkey", "bookings", type_="foreignkey")
    op.drop_column("bookings", "user_id")


def restore_actor_names() -> None:
    name_column = sa.Column("actor_name", sa.String(length=80), nullable=True)
    op.add_column("booking_events", name_column)
    op.execute(RESTORE_ACTOR_NAMES_SQL)
    op.alter_column("booking_events", "actor_name", nullable=False)
    op.drop_constraint(
        "booking_events_actor_user_id_fkey", "booking_events", type_="foreignkey"
    )
    op.drop_column("booking_events", "actor_user_id")
