/**
 * Helpers for the assistant conversation: the history sent with each request,
 * and turning a draft into the booking form's starting values.
 */
import type { AssistantHistoryEntry, DraftBooking } from "../../api/types";
import type { NewBookingDefaults } from "../bookings/bookingFormValues";
import { splitWallClockTime } from "../studio/studioTime";

// The API accepts at most this many earlier messages.
export const MAX_HISTORY_ENTRIES = 10;

/** The history with one more exchange, keeping only the most recent entries. */
export function addExchange(
  history: AssistantHistoryEntry[],
  question: string,
  answer: string,
): AssistantHistoryEntry[] {
  const exchange: AssistantHistoryEntry[] = [
    { role: "user", text: question },
    { role: "assistant", text: answer },
  ];
  return [...history, ...exchange].slice(-MAX_HISTORY_ENTRIES);
}

/** Starting values for the booking form, filled in from a draft. */
export function buildDefaultsFromDraft(
  draft: DraftBooking,
  bookerName: string,
  timezone: string,
): NewBookingDefaults {
  const start = splitWallClockTime(draft.starts_at, timezone);
  const end = splitWallClockTime(draft.ends_at, timezone);
  return {
    bookerName,
    purpose: draft.purpose,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    equipmentIds: draft.equipment_ids,
  };
}
