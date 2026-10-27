import { Dialog } from "../../components/ui/Dialog";
import { useStudioConfig } from "../studio/useStudioConfig";
import { BookingForm } from "./BookingForm";
import {
  buildBookingRequest,
  buildFormValuesFromBooking,
  buildNewFormValues,
  type NewBookingDefaults,
} from "./bookingForm";
import { BookingHistory } from "./BookingHistory";
import { CancelBookingSection } from "./CancelBookingSection";
import { useBooking, useCreateBooking, useUpdateBooking } from "./useBookings";

export type BookingDialogRequest =
  | { kind: "create"; defaults: NewBookingDefaults }
  | { kind: "edit"; bookingId: number };

interface BookingDialogProps {
  request: BookingDialogRequest | null;
  onClose: () => void;
}

/** Opens the booking form for a new booking or an existing one. */
export function BookingDialog({ request, onClose }: BookingDialogProps) {
  if (request === null) {
    return null;
  }
  if (request.kind === "create") {
    return (
      <CreateBookingDialog defaults={request.defaults} onClose={onClose} />
    );
  }
  return <EditBookingDialog bookingId={request.bookingId} onClose={onClose} />;
}

function CreateBookingDialog({
  defaults,
  onClose,
}: {
  defaults: NewBookingDefaults;
  onClose: () => void;
}) {
  const { data: config } = useStudioConfig();
  const createBooking = useCreateBooking();
  if (config === undefined) {
    return null;
  }

  return (
    <Dialog isOpen title="New booking" onClose={onClose}>
      <BookingForm
        initialValues={buildNewFormValues(defaults)}
        timezone={config.timezone}
        timeStepMinutes={config.time_step_minutes}
        isSaving={createBooking.isPending}
        saveError={createBooking.error}
        onSave={(values) =>
          createBooking.mutate(buildBookingRequest(values), {
            onSuccess: onClose,
          })
        }
        onClose={onClose}
      />
    </Dialog>
  );
}

function EditBookingDialog({
  bookingId,
  onClose,
}: {
  bookingId: number;
  onClose: () => void;
}) {
  const { data: config } = useStudioConfig();
  const { data: booking } = useBooking(bookingId);
  const updateBooking = useUpdateBooking(bookingId);
  if (config === undefined || booking === undefined) {
    return null;
  }

  const saveChanges = (values: Parameters<typeof buildBookingRequest>[0]) => {
    const request = {
      ...buildBookingRequest(values),
      version: booking.version,
    };
    updateBooking.mutate(request, { onSuccess: onClose });
  };

  return (
    <Dialog
      isOpen
      title={`Booking by ${booking.booker_name}`}
      onClose={onClose}
    >
      <BookingForm
        key={booking.version}
        initialValues={buildFormValuesFromBooking(booking, config.timezone)}
        existingBooking={booking}
        timezone={config.timezone}
        timeStepMinutes={config.time_step_minutes}
        isSaving={updateBooking.isPending}
        saveError={updateBooking.error}
        onSave={saveChanges}
        onClose={onClose}
      />
      <CancelBookingSection booking={booking} onCancelled={onClose} />
      <BookingHistory bookingId={booking.id} />
    </Dialog>
  );
}
