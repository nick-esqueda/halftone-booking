/**
 * Helpers for the assistant conversation: what it shows, the history sent
 * with each request, what each reply lets the person open, and turning a
 * draft into the booking form's starting values.
 */
import type {
  AssistantHistoryEntry,
  AssistantReply,
  Booking,
  DraftBooking,
} from "../../api/types";
import type { NewBookingDefaults } from "../bookings/bookingFormValues";
import { formatTimeRange, splitWallClockTime } from "../studio/studioTime";

// The API accepts at most this many earlier messages.
export const MAX_HISTORY_ENTRIES = 10;

/**
 * One line of the conversation. "confirmed" lines record what the person
 * saved or cancelled in the form; they're shown, but not sent to the API.
 */
export type ConversationEntry =
  AssistantHistoryEntry | { role: "confirmed"; text: string };

/** The conversation with one more question and answer. */
export function addExchange(
  conversation: ConversationEntry[],
  question: string,
  answer: string,
): ConversationEntry[] {
  return [
    ...conversation,
    { role: "user", text: question },
    { role: "assistant", text: answer },
  ];
}

/** The most recent messages, as the API takes them. */
export function toHistory(
  conversation: ConversationEntry[],
): AssistantHistoryEntry[] {
  const messages = conversation.filter(
    (entry): entry is AssistantHistoryEntry => entry.role !== "confirmed",
  );
  return messages.slice(-MAX_HISTORY_ENTRIES);
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

type ConfirmedAction = "draft" | AssistantSuggestion["kind"];

// How the conversation records each kind of confirmed suggestion.
const CONFIRMED_LABELS: Record<ConfirmedAction, string> = {
  draft: "Booked",
  change: "Changes saved",
  cancel: "Cancelled",
};

/**
 * The line recording what the person confirmed, from the booking as saved, so
 * it shows any edits they made in the form. For example
 * "Booked: Camera A, Thu 29 Oct, 1:00 PM – 3:00 PM (Interview)".
 */
export function describeConfirmed(
  target: ReplyTarget,
  booking: Booking,
  timezone: string,
): string {
  const action = target.kind === "draft" ? "draft" : target.suggestion.kind;
  const items = booking.items.map((item) => item.equipment_name).join(", ");
  const when = formatTimeRange(booking.starts_at, booking.ends_at, timezone);
  const purpose = booking.purpose.trim();
  const purposeText = purpose ? ` (${purpose})` : "";
  return `${CONFIRMED_LABELS[action]}: ${items}, ${when}${purposeText}`;
}
