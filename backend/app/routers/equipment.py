"""HTTP endpoints for equipment, availability and studio settings."""

from datetime import datetime

from fastapi import APIRouter, Query

from app.dependencies import (
    AvailabilityServiceDependency,
    LLMProviderDependency,
    SessionDependency,
    SettingsDependency,
)
from app.repositories.equipment_repository import EquipmentRepository
from app.routers.responses import ERROR_MODEL, SERVER_ERROR_RESPONSES
from app.schemas import (
    AvailabilityResponse,
    EquipmentResponse,
    StudioConfigResponse,
)

router = APIRouter(
    prefix="/api",
    tags=["equipment"],
    responses={**SERVER_ERROR_RESPONSES, 422: ERROR_MODEL},
)


@router.get("/equipment")
def list_equipment(session: SessionDependency) -> list[EquipmentResponse]:
    equipment = EquipmentRepository(session).list_active()
    return [EquipmentResponse.model_validate(item) for item in equipment]


@router.get("/availability")
def get_availability(
    service: AvailabilityServiceDependency,
    starts_at: datetime = Query(
        description="Range start; no offset means studio time."
    ),
    ends_at: datetime = Query(description="Range end; no offset means studio time."),
    excluded_booking_id: int | None = Query(
        default=None, description="Leave out this booking, e.g. the one being edited."
    ),
) -> AvailabilityResponse:
    return service.get_availability(starts_at, ends_at, excluded_booking_id)


@router.get("/config")
def get_studio_config(
    settings: SettingsDependency, provider: LLMProviderDependency
) -> StudioConfigResponse:
    return StudioConfigResponse(
        timezone=settings.studio_timezone,
        time_step_minutes=settings.time_step_minutes,
        assistant_enabled=provider is not None,
    )
