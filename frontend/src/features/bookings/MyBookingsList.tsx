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
    <ul className="divide-y divide-line">
      {bookings.map((booking) => (
        <MyBookingRow
          key={booking.id}
          booking={booking}
          timezone={timezone}
          onEdit={onEdit}
        />
      ))}
    </ul>
  );
}

interface MyBookingRowProps {
  booking: Booking;
  timezone: string;
  onEdit: (bookingId: number) => void;
}

function MyBookingRow({ booking, timezone, onEdit }: MyBookingRowProps) {
  const itemNames = booking.items.map((item) => item.equipment_name).join(", ");
  const timeRange = `${formatTime(booking.starts_at, timezone)} – ${formatTime(booking.ends_at, timezone)}`;
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
      <div className="w-32">
        <p className="font-semibold">
          {formatDay(booking.starts_at, timezone)}
        </p>
        <p className="text-xs text-ink-muted">{timeRange}</p>
      </div>
      <p className="min-w-[160px] flex-1 text-sm">{itemNames}</p>
      <p className="min-w-[120px] flex-1 text-sm text-ink-muted">
        {booking.purpose}
      </p>
      {booking.is_cancelled ? (
        <span className="text-xs text-ink-faint">Cancelled</span>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="text-accent"
            onClick={() => onEdit(booking.id)}
          >
            Edit
          </Button>
          <CancelBookingSection booking={booking} isCompact />
        </div>
      )}
    </li>
  );
}
