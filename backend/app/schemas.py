"""Request and response shapes for the HTTP API.

These classes define the API contract. The frontend's TypeScript types are
generated from the OpenAPI schema FastAPI builds from them.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BookingRequest(BaseModel):
    """Fields shared by creating and editing a booking.

    Times without a UTC offset are read as studio time.
    """

    booker_name: str
    purpose: str = ""
    equipment_ids: list[int] = Field(min_length=1)
    starts_at: datetime
    ends_at: datetime


class BookingCreateRequest(BookingRequest):
    pass


class BookingUpdateRequest(BookingRequest):
    version: int = Field(description="The version you loaded; stale saves are refused.")


class BookingCancelRequest(BaseModel):
    actor_name: str
    version: int


class EquipmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    description: str


class BookingItemResponse(BaseModel):
    equipment_id: int
    equipment_name: str


class BookingResponse(BaseModel):
    id: int
    booker_name: str
    purpose: str
    starts_at: datetime
    ends_at: datetime
    is_cancelled: bool
    version: int
    items: list[BookingItemResponse]


class BusySlotResponse(BaseModel):
    booking_id: int
    booker_name: str
    purpose: str
    starts_at: datetime
    ends_at: datetime


class EquipmentAvailabilityResponse(BaseModel):
    equipment: EquipmentResponse
    is_free: bool
    busy: list[BusySlotResponse]


class AvailabilityResponse(BaseModel):
    starts_at: datetime
    ends_at: datetime
    equipment: list[EquipmentAvailabilityResponse]


class BookingEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    action: str
    actor_name: str
    summary: str
    created_at: datetime


class StudioConfigResponse(BaseModel):
    timezone: str
    time_step_minutes: int


class ConflictResponse(BaseModel):
    equipment_id: int
    equipment_name: str
    booking_id: int
    booker_name: str
    starts_at: datetime
    ends_at: datetime


class ErrorResponse(BaseModel):
    code: str
    message: str
    conflicts: list[ConflictResponse] = []
    # Matches the X-Request-ID response header; quote it to find the API's logs.
    request_id: str | None = None


class HealthResponse(BaseModel):
    status: str
