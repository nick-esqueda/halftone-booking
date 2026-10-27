import { useState, type FormEvent, type ReactNode } from "react";

import { ApiError } from "../../api/client";
import type { Booking } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ErrorBanner } from "../../components/ui/ErrorBanner";
import {
  FIELD_LABEL_CLASS_NAME,
  TEXT_INPUT_CLASS_NAME,
} from "../../components/ui/styles";
import { useAvailability } from "../availability/useAvailability";
import { NameInput } from "../identity/NameInput";
import { buildTimeOptions } from "../studio/studioTime";
import { describeInViewerTime, getViewerTimezone } from "../studio/viewerTime";
import {
  findFormProblems,
  getEndWallClock,
  getRangeInstants,
  getStartWallClock,
  hasValidRange,
  toggleEquipment,
  type BookingFormValues,
} from "./bookingForm";
import { ItemPicker } from "./ItemPicker";

interface BookingFormProps {
  initialValues: BookingFormValues;
  existingBooking?: Booking;
  timezone: string;
  timeStepMinutes: number;
  isSaving: boolean;
  saveError: Error | null;
  onSave: (values: BookingFormValues) => void;
  onClose: () => void;
}

export function BookingForm(props: BookingFormProps) {
  const [values, setValues] = useState(props.initialValues);
  const [problems, setProblems] = useState<string[]>([]);
  const availability = useAvailability({
    startsAt: getStartWallClock(values),
    endsAt: getEndWallClock(values),
    excludedBookingId: props.existingBooking?.id,
    isEnabled: hasValidRange(values),
  });

  const updateValues = (changes: Partial<BookingFormValues>) =>
    setValues({ ...values, ...changes });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const foundProblems = findFormProblems(values);
    setProblems(foundProblems);
    if (foundProblems.length === 0) {
      props.onSave(values);
    }
  };

  const apiError = props.saveError instanceof ApiError ? props.saveError : null;
  const conflictingIds =
    apiError?.conflicts.map((conflict) => conflict.equipment_id) ?? [];
  const submitLabel = buildSubmitLabel(
    props.existingBooking !== undefined,
    values.equipmentIds.length,
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
      <Field label="Booked by">
        <NameInput
          label="Booked by"
          value={values.bookerName}
          onChange={(bookerName) => updateValues({ bookerName })}
          className="w-full"
        />
      </Field>

      <TimeRangeFields
        values={values}
        timezone={props.timezone}
        timeStepMinutes={props.timeStepMinutes}
        onChange={updateValues}
      />

      <Field label="Items">
        <ItemPicker
          rows={availability.data?.equipment ?? []}
          selectedIds={values.equipmentIds}
          conflictingIds={conflictingIds}
          timezone={props.timezone}
          onToggle={(equipmentId) =>
            updateValues({
              equipmentIds: toggleEquipment(values.equipmentIds, equipmentId),
            })
          }
        />
      </Field>

      <Field label="Purpose (optional)">
        <input
          aria-label="Purpose"
          value={values.purpose}
          onChange={(event) => updateValues({ purpose: event.target.value })}
          className={`${TEXT_INPUT_CLASS_NAME} w-full`}
        />
      </Field>

      <FormErrors problems={problems} saveError={props.saveError} />

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button onClick={props.onClose}>Close</Button>
        <Button
          type="submit"
          variant="primary"
          disabled={props.isSaving || values.equipmentIds.length === 0}
        >
          {props.isSaving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function buildSubmitLabel(isEditing: boolean, itemCount: number): string {
  if (isEditing) {
    return "Save changes";
  }
  if (itemCount === 0) {
    return "Pick an item";
  }
  const itemWord = itemCount === 1 ? "item" : "items";
  return `Book ${itemCount} ${itemWord}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className={FIELD_LABEL_CLASS_NAME}>{label}</span>
      {children}
    </div>
  );
}

interface TimeRangeFieldsProps {
  values: BookingFormValues;
  timezone: string;
  timeStepMinutes: number;
  onChange: (changes: Partial<BookingFormValues>) => void;
}

function TimeRangeFields({
  values,
  timezone,
  timeStepMinutes,
  onChange,
}: TimeRangeFieldsProps) {
  const timeOptions = buildTimeOptions(timeStepMinutes);
  const viewerTimeHint = describeViewerTimeHint(values, timezone);
  return (
    <Field label="When (studio time)">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <span className="text-sm text-ink-muted">From</span>
        <input
          type="date"
          aria-label="Start date"
          value={values.startDate}
          onChange={(event) => onChange({ startDate: event.target.value })}
          className={TEXT_INPUT_CLASS_NAME}
        />
        <TimeSelect
          label="Start time"
          value={values.startTime}
          options={timeOptions}
          onChange={(startTime) => onChange({ startTime })}
        />
        <span className="text-sm text-ink-muted">To</span>
        <input
          type="date"
          aria-label="End date"
          value={values.endDate}
          onChange={(event) => onChange({ endDate: event.target.value })}
          className={TEXT_INPUT_CLASS_NAME}
        />
        <TimeSelect
          label="End time"
          value={values.endTime}
          options={timeOptions}
          onChange={(endTime) => onChange({ endTime })}
        />
      </div>
      {viewerTimeHint && (
        <p className="mt-2 text-xs text-ink-muted">That's {viewerTimeHint}.</p>
      )}
    </Field>
  );
}

function describeViewerTimeHint(
  values: BookingFormValues,
  timezone: string,
): string | null {
  if (!hasValidRange(values)) {
    return null;
  }
  const { startsAt, endsAt } = getRangeInstants(values, timezone);
  return describeInViewerTime(startsAt, endsAt, timezone, getViewerTimezone());
}

interface TimeSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function TimeSelect({ label, value, options, onChange }: TimeSelectProps) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={TEXT_INPUT_CLASS_NAME}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function FormErrors({
  problems,
  saveError,
}: {
  problems: string[];
  saveError: Error | null;
}) {
  if (problems.length > 0) {
    return <ErrorBanner title={problems.join(" ")} />;
  }
  if (saveError === null) {
    return null;
  }

  const isConflict =
    saveError instanceof ApiError && saveError.code === "conflict";
  return (
    <ErrorBanner title={saveError.message}>
      {isConflict && (
        <p className="mt-1 text-ink-muted">
          Nothing was saved. Untick the taken item or pick another time.
        </p>
      )}
    </ErrorBanner>
  );
}
