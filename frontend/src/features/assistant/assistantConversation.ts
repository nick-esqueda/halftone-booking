/**
 * Helpers for the assistant conversation: the history sent with each request,
 * what each reply lets the person open, and turning a draft into the booking
 * form's starting values.
 */
import type {
  AssistantHistoryEntry,
  AssistantReply,
  DraftBooking,
} from "../../api/types";
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

/** A change or cancellation the assistant suggested for an existing booking. */
export type AssistantSuggestion =
  { kind: "change"; draft: DraftBooking } | { kind: "cancel" };

/** What a reply opens: the new-booking form, or an existing booking. */
export type ReplyTarget =
  | { kind: "draft"; draft: DraftBooking }
  | {
      kind: "booking";
      bookingId: number;
      suggestion: AssistantSuggestion;
      /** Where to scroll the schedule to, so the booking is in view. */
      startsAt: string;
    };

export interface ReplyAction {
  label: string;
  target: ReplyTarget;
}

type ReplyActionBuilder = (reply: AssistantReply) => ReplyAction | null;

// Replies that open something, by kind. Questions and messages open nothing.
const REPLY_ACTIONS: Partial<
  Record<AssistantReply["kind"], ReplyActionBuilder>
> = {
  draft: ({ draft }) =>
    draft
      ? { label: "Review the draft", target: { kind: "draft", draft } }
      : null,
  change: ({ draft, booking_id: bookingId }) =>
    draft && bookingId != null
      ? {
          label: "Review the change",
          target: {
            kind: "booking",
            bookingId,
            suggestion: { kind: "change", draft },
            startsAt: draft.starts_at,
          },
        }
      : null,
  cancel: ({ original, booking_id: bookingId }) =>
    original && bookingId != null
      ? {
          label: "Review the cancellation",
          target: {
            kind: "booking",
            bookingId,
            suggestion: { kind: "cancel" },
            startsAt: original.starts_at,
          },
        }
      : null,
};

/** The button a reply offers, or null when there's nothing to open. */
export function findReplyAction(reply: AssistantReply): ReplyAction | null {
  return REPLY_ACTIONS[reply.kind]?.(reply) ?? null;
}
