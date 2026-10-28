"""Request and response shapes for the HTTP API.

These classes define the API contract. The frontend's TypeScript types are
generated from the OpenAPI schema FastAPI builds from them.
"""

from datetime import datetime
from typing import Literal

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
    assistant_enabled: bool = Field(
        description="False when no AI provider is configured; the UI hides the assistant."
    )


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


class AssistantHistoryEntry(BaseModel):
    """An earlier message in the same assistant conversation."""

    role: Literal["user", "assistant"]
    text: str = Field(max_length=2000)


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    booker_name: str = ""
    history: list[AssistantHistoryEntry] = Field(default=[], max_length=10)


class DraftBooking(BaseModel):
    """A booking the assistant suggests. Nothing is saved until the person books it."""

    equipment_ids: list[int]
    starts_at: datetime
    ends_at: datetime
    purpose: str


class DraftOption(DraftBooking):
    label: str = Field(
        description='A readable time range, e.g. "Fri Oct 30, 9:00 AM – 1:00 PM".'
    )


class AssistantReply(BaseModel):
    """What the assistant suggests. Nothing is saved until the person confirms.

    - draft: a new booking (`draft`) to review in the booking form.
    - change: new values (`draft`) for an existing booking (`booking_id`,
      currently `original`), to review in that booking's form.
    - cancel: an existing booking (`booking_id`, `original`) to confirm cancelling.
    - question: a question, maybe with `options` to pick from.
    - message: a plain message.
    """

    kind: Literal["draft", "change", "cancel", "question", "message"]
    message: str
    draft: DraftBooking | None = None
    options: list[DraftOption] = []
    booking_id: int | None = None
    original: DraftBooking | None = None
