"""Database tables.

A user is one person at the studio, found by username. There is no password
yet; that arrives with real authentication in a later phase.

A booking is a header (who and why) plus one row per reserved item. Each
item row holds the reserved time range, and that is the only place the time
is stored. Postgres can only check overlaps between columns of one table, so
the anti-double-booking constraint lives on `booking_items`.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import TSTZRANGE, ExcludeConstraint, Range
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NO_OVERLAP_CONSTRAINT_NAME = "booking_items_no_overlap"
USERNAME_INDEX_NAME = "users_username_lower_key"


class Base(DeclarativeBase):
    pass


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    category: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # "Sam K" and "sam k" are the same person, so uniqueness ignores case.
        Index(USERNAME_INDEX_NAME, func.lower(text("username")), unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(200), default="")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Joined on every load: almost every use of a booking shows who booked it.
    user: Mapped[User] = relationship(lazy="joined", innerjoin=True)
    items: Mapped[list["BookingItem"]] = relationship(
        back_populates="booking", order_by="BookingItem.id"
    )

    @property
    def booker_name(self) -> str:
        return self.user.username

    @property
    def active_items(self) -> list["BookingItem"]:
        """Items that still hold their time slot."""
        return [item for item in self.items if item.cancelled_at is None]

    @property
    def is_cancelled(self) -> bool:
        return not self.active_items


class BookingItem(Base):
    __tablename__ = "booking_items"
    __table_args__ = (
        # The real guarantee against double-booking: no two uncancelled rows
        # may hold the same equipment over overlapping time ranges.
        ExcludeConstraint(
            ("equipment_id", "="),
            ("period", "&&"),
            name=NO_OVERLAP_CONSTRAINT_NAME,
            using="gist",
            where=text("cancelled_at IS NULL"),
        ),
        CheckConstraint("NOT isempty(period)", name="booking_items_period_not_empty"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), index=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"))
    period: Mapped[Range[datetime]] = mapped_column(TSTZRANGE)
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )

    booking: Mapped[Booking] = relationship(back_populates="items")
    equipment: Mapped[Equipment] = relationship()


class BookingEvent(Base):
    """History log: one row for every create, edit and cancel."""

    __tablename__ = "booking_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), index=True)
    action: Mapped[str] = mapped_column(String(20))
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    booking: Mapped[Booking] = relationship()
    actor: Mapped[User] = relationship(lazy="joined", innerjoin=True)

    @property
    def actor_name(self) -> str:
        return self.actor.username
