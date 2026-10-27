import { useState } from "react";

import type { Booking } from "../api/types";
import {
  BookingDialog,
  type BookingDialogRequest,
} from "../features/bookings/BookingDialog";
import { MyBookingsList } from "../features/bookings/MyBookingsList";
import { useBookingsFor } from "../features/bookings/useBookings";
import { useBookerNameContext } from "../features/identity/bookerNameStore";
import { useStudioConfig } from "../features/studio/useStudioConfig";

function isUpcoming(booking: Booking, now: Date): boolean {
  return !booking.is_cancelled && new Date(booking.ends_at) > now;
}

function sortByStart(bookings: Booking[]): Booking[] {
  return [...bookings].sort((first, second) =>
    first.starts_at.localeCompare(second.starts_at),
  );
}

export function MyBookingsPage() {
  const { bookerName } = useBookerNameContext();
  const { data: config } = useStudioConfig();
  const { data: bookings = [] } = useBookingsFor(bookerName);
  const [dialogRequest, setDialogRequest] =
    useState<BookingDialogRequest | null>(null);

  if (bookerName.trim() === "") {
    return (
      <p className="text-sm text-ink-muted">
        Enter your name in the top right to see your bookings.
      </p>
    );
  }
  if (config === undefined) {
    return null;
  }

  const now = new Date();
  const upcoming = sortByStart(
    bookings.filter((booking) => isUpcoming(booking, now)),
  );
  const pastOrCancelled = sortByStart(
    bookings.filter((booking) => !isUpcoming(booking, now)),
  ).reverse();
  const openEdit = (bookingId: number) =>
    setDialogRequest({ kind: "edit", bookingId });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-surface px-6 py-4">
        <h1 className="text-base font-semibold">Upcoming</h1>
        <MyBookingsList
          bookings={upcoming}
          timezone={config.timezone}
          onEdit={openEdit}
        />
      </section>
      <details className="rounded-xl border border-line bg-surface px-6 py-4">
        <summary className="cursor-pointer text-sm text-ink-muted">
          Past and cancelled bookings ({pastOrCancelled.length})
        </summary>
        <MyBookingsList
          bookings={pastOrCancelled}
          timezone={config.timezone}
          onEdit={openEdit}
        />
      </details>
      <BookingDialog
        request={dialogRequest}
        onClose={() => setDialogRequest(null)}
      />
    </div>
  );
}
