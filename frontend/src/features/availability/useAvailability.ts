import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiClient, unwrapResponse } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import type { Availability } from "../../api/types";

interface AvailabilityRange {
  startsAt: string;
  endsAt: string;
  excludedBookingId?: number;
  isEnabled?: boolean;
}

/** Who holds each item between two times. Times may be wall-clock studio time. */
export function useAvailability({
  startsAt,
  endsAt,
  excludedBookingId,
  isEnabled = true,
}: AvailabilityRange) {
  return useQuery<Availability>({
    queryKey: queryKeys.availability(startsAt, endsAt, excludedBookingId),
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/availability", {
          params: {
            query: {
              starts_at: startsAt,
              ends_at: endsAt,
              excluded_booking_id: excludedBookingId ?? null,
            },
          },
        }),
      ),
    enabled: isEnabled,
    placeholderData: keepPreviousData,
  });
}
