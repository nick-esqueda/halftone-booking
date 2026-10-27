"""Adds the studio's equipment to an empty database.

Run with `uv run python -m app.seed`. Running it again adds only what's
missing, so it is safe to repeat.
"""

from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Equipment
from app.repositories.equipment_repository import EquipmentRepository

STUDIO_EQUIPMENT: list[dict[str, str]] = [
    {"name": "Camera A", "category": "camera", "description": "Cinema camera kit"},
    {"name": "Camera B", "category": "camera", "description": "Cinema camera kit"},
    {"name": "Camera C", "category": "camera", "description": "Cinema camera kit"},
    {
        "name": "Lighting Kit 1",
        "category": "lighting",
        "description": "Three-point LED kit",
    },
    {
        "name": "Lighting Kit 2",
        "category": "lighting",
        "description": "Three-point LED kit",
    },
    {
        "name": "Lighting Kit 3",
        "category": "lighting",
        "description": "Three-point LED kit",
    },
    {
        "name": "Lighting Kit 4",
        "category": "lighting",
        "description": "Three-point LED kit",
    },
    {
        "name": "Podcast Room",
        "category": "room",
        "description": "Treated room, four mics",
    },
]


def seed_equipment(session: Session) -> int:
    """Insert any studio equipment not already present; return how many were added."""
    existing_names = {item.name for item in EquipmentRepository(session).list_active()}
    missing = [
        entry for entry in STUDIO_EQUIPMENT if entry["name"] not in existing_names
    ]
    for entry in missing:
        session.add(Equipment(**entry))
    session.commit()
    return len(missing)


if __name__ == "__main__":
    with get_session_factory()() as session:
        added_count = seed_equipment(session)
    print(f"Added {added_count} equipment items.")
