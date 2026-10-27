import type { Booking } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { formatDay, formatTime } from "../studio/studioTime";
import { CancelBookingSection } from "./CancelBookingSection";

interface MyBookingsListProps {
  bookings: Booking[];
  timezone: string;
  onEdit: (bookingId: number) => void;
}

export function MyBookingsList({
  bookings,
  timezone,
  onEdit,
}: MyBookingsListProps) {
  if (bookings.length === 0) {
    return <p className="py-6 text-sm text-ink-muted">Nothing here.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {COLUMN_NAMES.map((columnName) => (
              <th
                key={columnName}
                scope="col"
                className={HEADER_CELL_CLASS_NAME}
              >
                {columnName}
              </th>
            ))}
            <th scope="col" className={HEADER_CELL_CLASS_NAME}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {bookings.map((booking) => (
            <MyBookingRow
              key={booking.id}
              booking={booking}
              timezone={timezone}
              onEdit={onEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLUMN_NAMES = ["Date", "Time", "Equipment", "Purpose"];
const HEADER_CELL_CLASS_NAME =
  "py-2 pr-4 text-xs font-medium uppercase tracking-wide text-ink-faint";
const CELL_CLASS_NAME = "py-3 pr-4 align-middle";

interface MyBookingRowProps {
  booking: Booking;
  timezone: string;
  onEdit: (bookingId: number) => void;
}

function MyBookingRow({ booking, timezone, onEdit }: MyBookingRowProps) {
  const itemNames = booking.items.map((item) => item.equipment_name).join(", ");
  const timeRange = `${formatTime(booking.starts_at, timezone)} – ${formatTime(booking.ends_at, timezone)}`;
  return (
    <tr>
      <td className={`${CELL_CLASS_NAME} whitespace-nowrap font-semibold`}>
        {formatDay(booking.starts_at, timezone)}
      </td>
      <td className={`${CELL_CLASS_NAME} whitespace-nowrap tabular-nums`}>
        {timeRange}
      </td>
      <td className={CELL_CLASS_NAME}>{itemNames}</td>
      <td className={`${CELL_CLASS_NAME} text-ink-muted`}>{booking.purpose}</td>
      <td className={`${CELL_CLASS_NAME} text-right`}>
        <BookingActions booking={booking} onEdit={onEdit} />
      </td>
    </tr>
  );
}

function BookingActions({
  booking,
  onEdit,
}: {
  booking: Booking;
  onEdit: (bookingId: number) => void;
}) {
  if (booking.is_cancelled) {
    return <span className="text-xs text-ink-faint">Cancelled</span>;
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        className="text-accent"
        onClick={() => onEdit(booking.id)}
      >
        Edit
      </Button>
      <CancelBookingSection booking={booking} isCompact />
    </div>
  );
}
