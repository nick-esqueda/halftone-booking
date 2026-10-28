import { useState } from "react";

import type { Booking } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { useCancelAsViewer } from "./useCancelAsViewer";

interface CancelBookingSectionProps {
  booking: Booking;
  onCancelled?: () => void;
  /** Open already asking "Cancel this booking?", e.g. when the assistant suggested it. */
  startConfirming?: boolean;
}

/** A Cancel button for the booking dialog's footer that asks once, inline, before cancelling. */
export function CancelBookingSection({
  booking,
  onCancelled,
  startConfirming = false,
}: CancelBookingSectionProps) {
  const [isConfirming, setIsConfirming] = useState(startConfirming);
  const cancelBooking = useCancelAsViewer(onCancelled);

  if (booking.is_cancelled) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
      {cancelBooking.error && (
        <span className="mr-auto text-sm text-danger">
          {cancelBooking.error.message}
        </span>
      )}
      {isConfirming ? (
        <>
          <span className="text-sm font-semibold">Cancel this booking?</span>
          <Button onClick={() => setIsConfirming(false)}>Keep it</Button>
          <Button
            variant="danger"
            onClick={() => cancelBooking.cancel(booking)}
            disabled={cancelBooking.isPending}
          >
            Cancel booking
          </Button>
        </>
      ) : (
        <Button variant="ghost" onClick={() => setIsConfirming(true)}>
          Cancel
        </Button>
      )}
    </div>
  );
}
