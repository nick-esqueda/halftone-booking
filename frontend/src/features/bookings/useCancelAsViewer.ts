import type { Booking } from "../../api/types";
import { useBookerNameContext } from "../identity/bookerNameStore";
import { useCancelBooking } from "./useBookings";

/** Cancels a booking in the name of whoever is using the app. */
export function useCancelAsViewer(onCancelled?: (cancelled: Booking) => void) {
  const { bookerName } = useBookerNameContext();
  const cancelBooking = useCancelBooking();

  const cancel = (booking: Booking) =>
    cancelBooking.mutate(
      { booking, actorName: bookerName },
      { onSuccess: onCancelled },
    );

  return {
    cancel,
    error: cancelBooking.error,
    isPending: cancelBooking.isPending,
  };
}
