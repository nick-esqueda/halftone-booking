/**
 * The booking form's values, and how they convert to and from API shapes.
 * These checks only give fast feedback; the API re-checks every rule.
 */
import type { Booking, BookingCreateRequest } from "../../api/types";
import {
  buildWallClockTime,
  parseWallClock,
  splitWallClockTime,
} from "../studio/studioTime";

export interface BookingFormValues {
  bookerName: string;
  purpose: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  equipmentIds: number[];
}

export interface NewBookingDefaults {
  bookerName: string;
  purpose?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  equipmentIds: number[];
}

export function buildNewFormValues(
  defaults: NewBookingDefaults,
): BookingFormValues {
  return { ...defaults, purpose: defaults.purpose ?? "" };
}

export function buildFormValuesFromBooking(
  booking: Booking,
  timezone: string,
): BookingFormValues {
  const start = splitWallClockTime(booking.starts_at, timezone);
  const end = splitWallClockTime(booking.ends_at, timezone);
  return {
    bookerName: booking.booker_name,
    purpose: booking.purpose,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    equipmentIds: booking.items.map((item) => item.equipment_id),
  };
}

export function getStartWallClock(values: BookingFormValues): string {
  return buildWallClockTime(values.startDate, values.startTime);
}

export function getEndWallClock(values: BookingFormValues): string {
  return buildWallClockTime(values.endDate, values.endTime);
}

export function buildBookingRequest(
  values: BookingFormValues,
): BookingCreateRequest {
  return {
    booker_name: values.bookerName,
    purpose: values.purpose,
    equipment_ids: values.equipmentIds,
    starts_at: getStartWallClock(values),
    ends_at: getEndWallClock(values),
  };
}

interface FormCheck {
  isFailing: (values: BookingFormValues) => boolean;
  message: string;
}

// Wall-clock strings in the same format compare correctly as text.
const FORM_CHECKS: FormCheck[] = [
  {
    isFailing: (values) => values.bookerName.trim() === "",
    message: "Enter your name.",
  },
  {
    isFailing: (values) => values.equipmentIds.length === 0,
    message: "Pick at least one item.",
  },
  {
    isFailing: (values) => getEndWallClock(values) <= getStartWallClock(values),
    message: "The end must be after the start.",
  },
];

/** Messages for anything obviously missing, before asking the API. */
export function findFormProblems(values: BookingFormValues): string[] {
  const failingChecks = FORM_CHECKS.filter((check) => check.isFailing(values));
  return failingChecks.map((check) => check.message);
}

export function hasValidRange(values: BookingFormValues): boolean {
  return getEndWallClock(values) > getStartWallClock(values);
}

export function toggleEquipment(
  equipmentIds: number[],
  equipmentId: number,
): number[] {
  const isSelected = equipmentIds.includes(equipmentId);
  return isSelected
    ? equipmentIds.filter((id) => id !== equipmentId)
    : [...equipmentIds, equipmentId];
}

/** The chosen range as ISO instants, for showing it in another timezone. */
export function getRangeInstants(
  values: BookingFormValues,
  timezone: string,
): { startsAt: string; endsAt: string } {
  const start = { date: values.startDate, time: values.startTime };
  const end = { date: values.endDate, time: values.endTime };
  return {
    startsAt: parseWallClock(start, timezone).toISOString(),
    endsAt: parseWallClock(end, timezone).toISOString(),
  };
}
