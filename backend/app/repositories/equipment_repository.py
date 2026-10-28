"""Database access for equipment."""

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Equipment


class EquipmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_active(self) -> list[Equipment]:
        query = (
            select(Equipment)
            .where(Equipment.is_active.is_(True))
            .order_by(Equipment.category, Equipment.name)
        )
        return list(self.session.scalars(query))

    def get_many(self, equipment_ids: Iterable[int]) -> list[Equipment]:
        query = select(Equipment).where(Equipment.id.in_(list(equipment_ids)))
        return list(self.session.scalars(query))
