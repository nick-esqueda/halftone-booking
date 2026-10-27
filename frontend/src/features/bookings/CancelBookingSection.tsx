import { useState } from "react";

import type { Booking } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { useBookerNameContext } from "../identity/bookerNameStore";
import { useCancelBooking } from "./useBookings";

interface CancelBookingSectionProps {
  booking: Booking;
  onCancelled?: () => void;
  isCompact?: boolean;
}

/** A Cancel button that asks once, inline, before cancelling. */
export function CancelBookingSection({
  booking,
  onCancelled,
  isCompact = false,
}: CancelBookingSectionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const { bookerName } = useBookerNameContext();
  const cancelBooking = useCancelBooking();

  if (booking.is_cancelled) {
    return null;
  }

  const confirmCancel = () =>
    cancelBooking.mutate(
      { booking, actorName: bookerName },
      { onSuccess: onCancelled },
    );
  const wrapperClassName = isCompact
    ? "flex items-center justify-end gap-2"
    : "flex items-center justify-end gap-2 border-t border-line px-6 py-4";

  return (
    <div className={wrapperClassName}>
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
            onClick={confirmCancel}
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
