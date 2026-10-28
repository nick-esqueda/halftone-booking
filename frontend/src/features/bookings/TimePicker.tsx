import {
  buildMinuteOptions,
  CLOCK_HOURS,
  DAY_PERIODS,
  joinClockValue,
  padTwoDigits,
  splitClockValue,
  type ClockParts,
} from "../studio/clockTime";

interface TimePickerProps {
  label: string;
  value: string; // "HH:mm", 24-hour
  stepMinutes: number;
  onChange: (value: string) => void;
}

const PART_SELECT_CLASS_NAME =
  "rounded-md bg-transparent px-1.5 py-1.5 text-sm tabular-nums hover:bg-muted focus:outline-none focus:ring-2 focus:ring-accent-soft";
const PERIOD_BUTTON_CLASS_NAME = "rounded-md px-2 py-1 text-xs font-semibold";
const SELECTED_PERIOD_CLASS_NAME = "bg-accent text-surface";
const UNSELECTED_PERIOD_CLASS_NAME = "text-ink-muted hover:bg-muted";

/**
 * A compact 12-hour time picker: hour, minutes, then AM or PM. Short lists
 * instead of one long dropdown with every time of day.
 */
export function TimePicker({
  label,
  value,
  stepMinutes,
  onChange,
}: TimePickerProps) {
  const parts = splitClockValue(value);
  const minuteOptions = buildMinuteOptions(stepMinutes);
  const updatePart = (changes: Partial<ClockParts>) =>
    onChange(joinClockValue({ ...parts, ...changes }));

  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-lg border border-line-strong bg-surface px-1 focus-within:border-accent"
    >
      <select
        aria-label={`${label} hour`}
        value={parts.hour}
        onChange={(event) => updatePart({ hour: Number(event.target.value) })}
        className={PART_SELECT_CLASS_NAME}
      >
        {CLOCK_HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>
      <span className="text-ink-muted">:</span>
      <select
        aria-label={`${label} minutes`}
        value={parts.minute}
        onChange={(event) => updatePart({ minute: Number(event.target.value) })}
        className={PART_SELECT_CLASS_NAME}
      >
        {minuteOptions.map((minute) => (
          <option key={minute} value={minute}>
            {padTwoDigits(minute)}
          </option>
        ))}
      </select>
      <div className="ml-1 flex gap-0.5">
        {DAY_PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={parts.period === period}
            onClick={() => updatePart({ period })}
            className={`${PERIOD_BUTTON_CLASS_NAME} ${parts.period === period ? SELECTED_PERIOD_CLASS_NAME : UNSELECTED_PERIOD_CLASS_NAME}`}
          >
            {period}
          </button>
        ))}
      </div>
    </div>
  );
}
