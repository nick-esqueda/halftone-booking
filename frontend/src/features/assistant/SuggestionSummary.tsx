import type { Booking, DraftBooking } from "../../api/types";
import { useEquipment } from "../bookings/useEquipment";
import { describeChanges, toDraftShape } from "./suggestedChanges";

const BOX_CLASS_NAME =
  "mx-6 mt-5 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 text-sm";

interface ChangeSummaryProps {
  booking: Booking;
  draft: DraftBooking;
  timezone: string;
}

/** "Suggested by the assistant", with each changed field as before → after. */
export function ChangeSummary({
  booking,
  draft,
  timezone,
}: ChangeSummaryProps) {
  const equipment = useEquipment().data ?? [];
  const namesById = new Map(equipment.map((item) => [item.id, item.name]));
  const rows = describeChanges(toDraftShape(booking), draft, {
    namesById,
    timezone,
  });

  return (
    <section aria-label="Suggested changes" className={BOX_CLASS_NAME}>
      <p className="font-semibold">Suggested by the assistant</p>
      {rows.length === 0 ? (
        <p className="text-ink-muted">Nothing would change.</p>
      ) : (
        <dl className="mt-1 space-y-1">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-wrap gap-x-2">
              <dt className="w-16 shrink-0 text-ink-muted">{row.label}</dt>
              <dd>
                <del className="text-ink-muted">{row.before}</del>
                <span aria-hidden="true"> → </span>
                <ins className="font-medium no-underline">{row.after}</ins>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2 text-ink-muted">
        Check the form below, then Save changes. Nothing changes until you do.
      </p>
    </section>
  );
}

/** The note shown when the assistant suggests cancelling the open booking. */
export function CancelSummary() {
  return (
    <section aria-label="Suggested cancellation" className={BOX_CLASS_NAME}>
      <p className="font-semibold">
        The assistant suggests cancelling this booking.
      </p>
      <p className="text-ink-muted">
        Confirm at the bottom. Nothing is cancelled until you do.
      </p>
    </section>
  );
}
