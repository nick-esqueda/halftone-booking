import type { Booking } from "../../api/types";
import { useCurrentUser } from "../session/sessionContext";
import { useCancelBooking } from "./useBookings";

/** Cancels a booking in the name of whoever is using the app. */
export function useCancelAsViewer(onCancelled?: (cancelled: Booking) => void) {
  const { username } = useCurrentUser();
  const cancelBooking = useCancelBooking();

  const cancel = (booking: Booking) =>
    cancelBooking.mutate(
      { booking, actorName: username },
      { onSuccess: onCancelled },
    );

  return {
    cancel,
    error: cancelBooking.error,
    isPending: cancelBooking.isPending,
  };
}
