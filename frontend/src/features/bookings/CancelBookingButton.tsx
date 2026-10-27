import { useState } from "react";

import type { Booking } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { formatTimeRange } from "../studio/studioTime";
import { useCancelAsViewer } from "./useCancelAsViewer";

interface CancelBookingButtonProps {
  booking: Booking;
  timezone: string;
}

/**
 * A Cancel button for tight spaces such as table rows: it asks in a small
 * dialog that names the booking, so the row never changes size.
 */
export function CancelBookingButton({
  booking,
  timezone,
}: CancelBookingButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const closeConfirmation = () => setIsConfirming(false);
  const cancelBooking = useCancelAsViewer(closeConfirmation);

  const itemNames = booking.items.map((item) => item.equipment_name).join(", ");
  const timeRange = formatTimeRange(
    booking.starts_at,
    booking.ends_at,
    timezone,
  );

  return (
    <>
      <Button variant="ghost" onClick={() => setIsConfirming(true)}>
        Cancel
      </Button>
      <Dialog
        isOpen={isConfirming}
        onClose={closeConfirmation}
        title="Cancel this booking?"
      >
        <div className="space-y-1 px-6 py-5 text-sm">
          <p className="font-semibold">{itemNames}</p>
          <p className="text-ink-muted">{timeRange}</p>
          {booking.purpose && (
            <p className="text-ink-muted">{booking.purpose}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
          {cancelBooking.error && (
            <span role="alert" className="mr-auto text-sm text-danger">
              {cancelBooking.error.message}
            </span>
          )}
          <Button onClick={closeConfirmation}>Keep it</Button>
          <Button
            variant="danger"
            onClick={() => cancelBooking.cancel(booking)}
            disabled={cancelBooking.isPending}
          >
            Cancel booking
          </Button>
        </div>
      </Dialog>
    </>
  );
}
