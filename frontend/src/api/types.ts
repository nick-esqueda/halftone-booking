import type { components } from "./schema";

type Schemas = components["schemas"];

export type Equipment = Schemas["EquipmentResponse"];
export type Booking = Schemas["BookingResponse"];
export type BookingEvent = Schemas["BookingEventResponse"];
export type BookingCreateRequest = Schemas["BookingCreateRequest"];
export type BookingUpdateRequest = Schemas["BookingUpdateRequest"];
export type Availability = Schemas["AvailabilityResponse"];
export type EquipmentAvailability = Schemas["EquipmentAvailabilityResponse"];
export type BusySlot = Schemas["BusySlotResponse"];
export type StudioConfig = Schemas["StudioConfigResponse"];
export type Conflict = Schemas["ConflictResponse"];
export type ApiErrorBody = Schemas["ErrorResponse"];
