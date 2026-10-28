/** Query cache keys, in one place so invalidation can't miss one. */
export const queryKeys = {
  config: ["config"] as const,
  equipment: ["equipment"] as const,
  bookerNames: ["booker-names"] as const,
  availabilityAll: ["availability"] as const,
  availability: (
    startsAt: string,
    endsAt: string,
    excludedBookingId?: number,
  ) => ["availability", startsAt, endsAt, excludedBookingId ?? null] as const,
  bookingsAll: ["bookings"] as const,
  bookingsFor: (bookerName: string) =>
    ["bookings", "by-name", bookerName] as const,
  booking: (bookingId: number) => ["bookings", bookingId] as const,
  history: (bookingId: number) => ["bookings", bookingId, "history"] as const,
};
