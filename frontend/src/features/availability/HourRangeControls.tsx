import {
  HOUR_RANGE_LABELS,
  HOUR_RANGES,
  type HourRangeName,
} from "./dayLayout";

const RANGE_NAMES = Object.keys(HOUR_RANGES) as HourRangeName[];

interface HourRangeToggleProps {
  selected: HourRangeName;
  onChange: (name: HourRangeName) => void;
}

/** Switches the timeline between studio hours and all 24 hours. */
export function HourRangeToggle({ selected, onChange }: HourRangeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Hours shown"
      className="inline-flex rounded-full border border-line-strong p-0.5"
    >
      {RANGE_NAMES.map((name) => {
        const isSelected = name === selected;
        const stateClassName = isSelected
          ? "bg-muted text-ink"
          : "text-ink-muted hover:text-ink";
        return (
          <button
            key={name}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(name)}
            className={`rounded-full px-3 py-1 text-xs ${stateClassName}`}
          >
            {HOUR_RANGE_LABELS[name]}
          </button>
        );
      })}
    </div>
  );
}

interface HiddenBookingsHintProps {
  count: number;
  onShowAll: () => void;
}

/** Says when bookings fall outside the hours shown, with a way to see them. */
export function HiddenBookingsHint({
  count,
  onShowAll,
}: HiddenBookingsHintProps) {
  if (count === 0) {
    return null;
  }
  const noun = count === 1 ? "booking" : "bookings";
  return (
    <p className="text-sm text-ink-muted">
      {count} {noun} outside these hours ·{" "}
      <button
        type="button"
        onClick={onShowAll}
        className="font-medium text-accent hover:underline"
      >
        Show all hours
      </button>
    </p>
  );
}
