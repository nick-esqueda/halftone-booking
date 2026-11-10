"""Database access for users."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User


class UserRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, user_id: int) -> User | None:
        return self.session.get(User, user_id)

    def find_by_username(self, username: str) -> User | None:
        """Match ignoring case, as the unique index does."""
        name_matches = func.lower(User.username) == username.lower()
        return self.session.scalars(select(User).where(name_matches)).first()

    def list_all(self) -> list[User]:
        query = select(User).order_by(func.lower(User.username))
        return list(self.session.scalars(query))

    def add(self, user: User) -> None:
        self.session.add(user)
