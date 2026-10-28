/**
 * The 12-hour clock the app shows. Form values and the API stay on the
 * 24-hour "HH:mm" form; these helpers convert for display and for the
 * hour / minute / AM-PM parts of the time picker.
 */

export type DayPeriod = "AM" | "PM";

export interface ClockParts {
  hour: number; // 1-12
  minute: number;
  period: DayPeriod;
}

export const DAY_PERIODS: DayPeriod[] = ["AM", "PM"];

const HOURS_ON_CLOCK_FACE = 12;
const MINUTES_PER_HOUR = 60;

// Hours after noon, by period, when converting back to the 24-hour clock.
const PERIOD_HOUR_OFFSETS: Record<DayPeriod, number> = { AM: 0, PM: 12 };

/** The hours on a clock face, 1 to 12. */
export const CLOCK_HOURS = Array.from(
  { length: HOURS_ON_CLOCK_FACE },
  (_, index) => index + 1,
);

/** "14:30" → { hour: 2, minute: 30, period: "PM" }. */
export function splitClockValue(value: string): ClockParts {
  const [hours24, minute] = value.split(":").map(Number);
  const period: DayPeriod = hours24 < HOURS_ON_CLOCK_FACE ? "AM" : "PM";
  const hour = hours24 % HOURS_ON_CLOCK_FACE || HOURS_ON_CLOCK_FACE;
  return { hour, minute, period };
}

/** { hour: 2, minute: 30, period: "PM" } → "14:30". */
export function joinClockValue(parts: ClockParts): string {
  const hourInPeriod = parts.hour % HOURS_ON_CLOCK_FACE;
  const hours24 = hourInPeriod + PERIOD_HOUR_OFFSETS[parts.period];
  return `${padTwoDigits(hours24)}:${padTwoDigits(parts.minute)}`;
}

/** "14:30" → "2:30 PM". */
export function formatClockValue(value: string): string {
  const parts = splitClockValue(value);
  return `${parts.hour}:${padTwoDigits(parts.minute)} ${parts.period}`;
}

/** An hour of the day as a short label: 7 → "7 AM", 12 → "12 PM". */
export function formatHourLabel(hours24: number): string {
  const parts = splitClockValue(`${hours24 % 24}:00`);
  return `${parts.hour} ${parts.period}`;
}

/** The minutes a booking can start on, e.g. [0, 15, 30, 45] for a 15-minute step. */
export function buildMinuteOptions(stepMinutes: number): number[] {
  const optionCount = MINUTES_PER_HOUR / stepMinutes;
  return Array.from({ length: optionCount }, (_, index) => index * stepMinutes);
}

export function padTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
