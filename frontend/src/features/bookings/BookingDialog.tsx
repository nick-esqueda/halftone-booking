import type { DraftBooking } from "../../api/types";
import { Dialog } from "../../components/ui/Dialog";
import { LoadError } from "../../components/ui/LoadError";
import {
  buildDefaultsFromDraft,
  type AssistantSuggestion,
} from "../assistant/assistantConversation";
import { CancelSummary, ChangeSummary } from "../assistant/SuggestionSummary";
import { useStudioConfig } from "../studio/useStudioConfig";
import { BookingForm } from "./BookingForm";
import {
  buildBookingRequest,
  buildFormValuesFromBooking,
  buildNewFormValues,
  type BookingFormValues,
  type NewBookingDefaults,
} from "./bookingFormValues";
import { BookingHistory } from "./BookingHistory";
import { CancelBookingSection } from "./CancelBookingSection";
import { useBooking, useCreateBooking, useUpdateBooking } from "./useBookings";

export type BookingDialogRequest =
  | { kind: "create"; defaults: NewBookingDefaults }
  | { kind: "edit"; bookingId: number; suggestion?: AssistantSuggestion };

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
  return (
    <EditBookingDialog
      bookingId={request.bookingId}
      suggestion={request.suggestion}
      onClose={onClose}
    />
  );
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

interface EditBookingDialogProps {
  bookingId: number;
  suggestion?: AssistantSuggestion;
  onClose: () => void;
}

function EditBookingDialog({
  bookingId,
  suggestion,
  onClose,
}: EditBookingDialogProps) {
  const { data: config } = useStudioConfig();
  const bookingQuery = useBooking(bookingId);
  const booking = bookingQuery.data;
  const updateBooking = useUpdateBooking(bookingId);
  if (bookingQuery.error) {
    return (
      <Dialog isOpen title="Booking" onClose={onClose}>
        <div className="px-6 py-5">
          <LoadError
            subject="this booking"
            error={bookingQuery.error}
            onRetry={() => void bookingQuery.refetch()}
            isRetrying={bookingQuery.isFetching}
          />
        </div>
      </Dialog>
    );
  }
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

  const savedValues = buildFormValuesFromBooking(booking, config.timezone);
  const initialValues =
    suggestion?.kind === "change"
      ? applySuggestedChange(savedValues, suggestion.draft, config.timezone)
      : savedValues;

  return (
    <Dialog
      isOpen
      title={`Booking by ${booking.booker_name}`}
      onClose={onClose}
    >
      {suggestion?.kind === "change" && (
        <ChangeSummary
          booking={booking}
          draft={suggestion.draft}
          timezone={config.timezone}
        />
      )}
      {suggestion?.kind === "cancel" && <CancelSummary />}
      <BookingForm
        key={booking.version}
        initialValues={initialValues}
        existingBooking={booking}
        timezone={config.timezone}
        timeStepMinutes={config.time_step_minutes}
        isSaving={updateBooking.isPending}
        saveError={updateBooking.error}
        onSave={saveChanges}
        onClose={onClose}
      />
      <CancelBookingSection
        booking={booking}
        onCancelled={onClose}
        startConfirming={suggestion?.kind === "cancel"}
      />
      <BookingHistory bookingId={booking.id} />
    </Dialog>
  );
}

/** The saved booking's form values with the assistant's suggestion applied. */
function applySuggestedChange(
  savedValues: BookingFormValues,
  draft: DraftBooking,
  timezone: string,
): BookingFormValues {
  const suggested = buildDefaultsFromDraft(
    draft,
    savedValues.bookerName,
    timezone,
  );
  return { ...suggested, purpose: draft.purpose };
}
