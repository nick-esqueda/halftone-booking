"""Finding users: logging in, and checking the names put on bookings.

Nothing here creates users. The studio's users come from the seed (see
app/studio_users.py). There are no passwords yet, so logging in only checks
that the username exists.
"""

import logging

from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import (
    InvalidBookingError,
    NotFoundError,
    UnknownUserError,
    UserNotFoundError,
)
from app.models import User
from app.repositories.user_repository import UserRepository
from app.services.booking_rules import normalize_name
from app.studio_time import Clock

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, session: Session, settings: Settings, clock: Clock) -> None:
        self.session = session
        self.settings = settings
        self.clock = clock
        self.users = UserRepository(session)

    def log_in(self, username: str) -> User:
        """Find the user and note when they logged in; 404 if there's none."""
        user = self.users.find_by_username(self.normalize_username(username))
        if user is None:
            raise UserNotFoundError("No user has that username.")

        user.last_login_at = self.clock.now()
        self.session.commit()
        logger.info("User logged in", extra={"user_id": user.id})
        return user

    def get_user(self, user_id: int) -> User:
        user = self.users.get(user_id)
        if user is None:
            raise NotFoundError(f"User {user_id} doesn't exist.")
        return user

    def list_users(self) -> list[User]:
        return self.users.list_all()

    def resolve(self, name: str) -> User:
        """The user a booking names; 422 when nobody has that username."""
        user = self.users.find_by_username(normalize_name(name))
        if user is None:
            raise UnknownUserError("Bookings can only be made for studio users.")
        return user

    def normalize_username(self, username: str) -> str:
        """Trim and collapse spaces, then check the name isn't empty or too long."""
        normalized = normalize_name(username)
        if not normalized:
            raise InvalidBookingError("name_required", "Please enter your name.")
        if len(normalized) > self.settings.max_booker_name_length:
            raise InvalidBookingError("text_too_long", "That username is too long.")
        return normalized
