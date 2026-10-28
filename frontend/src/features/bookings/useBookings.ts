import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiClient, unwrapResponse } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import type {
  Booking,
  BookingCreateRequest,
  BookingEvent,
  BookingUpdateRequest,
} from "../../api/types";

export function useBooking(bookingId: number | undefined) {
  return useQuery<Booking>({
    queryKey: queryKeys.booking(bookingId ?? 0),
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/bookings/{booking_id}", {
          params: { path: { booking_id: bookingId ?? 0 } },
        }),
      ),
    enabled: bookingId !== undefined,
  });
}

export function useBookingsFor(bookerName: string) {
  const trimmedName = bookerName.trim();
  return useQuery<Booking[]>({
    queryKey: queryKeys.bookingsFor(trimmedName),
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/bookings", {
          params: { query: { booker_name: trimmedName } },
        }),
      ),
    enabled: trimmedName !== "",
  });
}

export function useBookingHistory(bookingId: number) {
  return useQuery<BookingEvent[]>({
    queryKey: queryKeys.history(bookingId),
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/bookings/{booking_id}/history", {
          params: { path: { booking_id: bookingId } },
        }),
      ),
  });
}

const STALE_VERSION_CODE = "stale_version";

function isStaleVersionError(error: Error): boolean {
  return error instanceof ApiError && error.code === STALE_VERSION_CODE;
}

/** After any booking change, refetch everything that shows bookings. */
function useRefreshBookingQueries() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.availabilityAll });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookingsAll });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookerNames });
  };
}

/**
 * When someone else changed the booking first, load their version so the
 * dialog shows it and the next save uses the new version number.
 */
function useRefreshWhenStale() {
  const refreshBookingQueries = useRefreshBookingQueries();
  return (error: Error) => {
    if (isStaleVersionError(error)) {
      refreshBookingQueries();
    }
  };
}

export function useCreateBooking() {
  const refreshBookingQueries = useRefreshBookingQueries();
  return useMutation({
    mutationFn: (request: BookingCreateRequest) =>
      unwrapResponse(apiClient.POST("/api/bookings", { body: request })),
    onSuccess: refreshBookingQueries,
  });
}

export function useUpdateBooking(bookingId: number) {
  const refreshBookingQueries = useRefreshBookingQueries();
  const refreshWhenStale = useRefreshWhenStale();
  return useMutation({
    mutationFn: (request: BookingUpdateRequest) =>
      unwrapResponse(
        apiClient.PUT("/api/bookings/{booking_id}", {
          params: { path: { booking_id: bookingId } },
          body: request,
        }),
      ),
    onSuccess: refreshBookingQueries,
    onError: refreshWhenStale,
  });
}

interface CancelBookingInput {
  booking: Booking;
  actorName: string;
}

export function useCancelBooking() {
  const refreshBookingQueries = useRefreshBookingQueries();
  const refreshWhenStale = useRefreshWhenStale();
  return useMutation({
    mutationFn: ({ booking, actorName }: CancelBookingInput) =>
      unwrapResponse(
        apiClient.POST("/api/bookings/{booking_id}/cancel", {
          params: { path: { booking_id: booking.id } },
          body: {
            actor_name: actorName || booking.booker_name,
            version: booking.version,
          },
        }),
      ),
    onSuccess: refreshBookingQueries,
    onError: refreshWhenStale,
  });
}
