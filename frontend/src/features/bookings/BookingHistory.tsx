import { useStudioConfig } from "../studio/useStudioConfig";
import { formatDay, formatTime } from "../studio/studioTime";
import { useBookingHistory } from "./useBookings";

const ACTION_LABELS: Record<string, string> = {
  created: "Booked",
  updated: "Changed",
  cancelled: "Cancelled",
};

/** Who did what to this booking, oldest first. */
export function BookingHistory({ bookingId }: { bookingId: number }) {
  const { data: events = [] } = useBookingHistory(bookingId);
  const { data: config } = useStudioConfig();
  if (config === undefined || events.length === 0) {
    return null;
  }

  return (
    <details className="border-t border-line px-6 py-4 text-sm">
      <summary className="cursor-pointer text-ink-muted">
        History ({events.length})
      </summary>
      <ol className="mt-2 space-y-1">
        {events.map((event) => {
          const when = `${formatDay(event.created_at, config.timezone)} ${formatTime(event.created_at, config.timezone)}`;
          const actionLabel = ACTION_LABELS[event.action] ?? event.action;
          return (
            <li
              key={event.created_at + event.action}
              className="text-ink-muted"
            >
              <span className="font-medium text-ink">{event.actor_name}</span> ·{" "}
              {actionLabel} · {when}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
