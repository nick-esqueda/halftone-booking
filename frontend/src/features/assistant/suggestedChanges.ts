/**
 * What an assistant-suggested change would change, as "before → after" rows.
 *
 * Pattern: a list of field describers. Each turns one field of a booking into
 * readable text; a row is shown only when the text differs. To show a new
 * field, add a describer to `FIELD_DESCRIBERS`.
 */
import type { Booking, DraftBooking } from "../../api/types";
import { formatTimeRange } from "../studio/studioTime";

export interface ChangeRow {
  label: string;
  before: string;
  after: string;
}

interface DescribeContext {
  namesById: Map<number, string>;
  timezone: string;
}

interface FieldDescriber {
  label: string;
  describe: (booking: DraftBooking, context: DescribeContext) => string;
}

const NO_PURPOSE = "(none)";

const FIELD_DESCRIBERS: FieldDescriber[] = [
  {
    label: "When",
    describe: (booking, context) =>
      formatTimeRange(booking.starts_at, booking.ends_at, context.timezone),
  },
  {
    label: "Items",
    describe: (booking, context) => describeItems(booking, context.namesById),
  },
  {
    label: "Purpose",
    describe: (booking) => booking.purpose.trim() || NO_PURPOSE,
  },
];

/** The saved booking in the same shape as a suggestion, for comparing. */
export function toDraftShape(booking: Booking): DraftBooking {
  return {
    equipment_ids: booking.items.map((item) => item.equipment_id),
    starts_at: booking.starts_at,
    ends_at: booking.ends_at,
    purpose: booking.purpose,
  };
}

/** One row per field that the suggestion changes. */
export function describeChanges(
  before: DraftBooking,
  after: DraftBooking,
  context: DescribeContext,
): ChangeRow[] {
  const rows = FIELD_DESCRIBERS.map((field) => ({
    label: field.label,
    before: field.describe(before, context),
    after: field.describe(after, context),
  }));
  return rows.filter((row) => row.before !== row.after);
}

function describeItems(
  booking: DraftBooking,
  namesById: Map<number, string>,
): string {
  const names = booking.equipment_ids.map(
    (id) => namesById.get(id) ?? `Item ${id}`,
  );
  return names.sort().join(", ");
}
