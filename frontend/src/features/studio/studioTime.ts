/**
 * Display helpers for studio time. The API owns every time rule; these only
 * format times and build the plain wall-clock strings the API accepts
 * ("2026-10-29T13:00" means 13:00 studio time).
 */
import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addHours,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "date-fns";

const MONDAY = 1;

export const DATE_INPUT_FORMAT = "yyyy-MM-dd";
export const TIME_INPUT_FORMAT = "HH:mm";
const TIME_FORMAT = "HH:mm";
const DAY_FORMAT = "EEE d MMM";
const SHORT_DAY_FORMAT = "EEE d";

export function toStudioDate(value: string | Date, timezone: string): TZDate {
  const instant = typeof value === "string" ? new Date(value) : value;
  return new TZDate(instant, timezone);
}

export function formatTime(value: string, timezone: string): string {
  return format(toStudioDate(value, timezone), TIME_FORMAT);
}

export function formatDay(value: string | Date, timezone: string): string {
  return format(toStudioDate(value, timezone), DAY_FORMAT);
}

export function formatShortDay(value: Date): string {
  return format(value, SHORT_DAY_FORMAT);
}

/** "Thu 29 Oct, 13:00 – 15:00", or both days when the range spans days. */
export function formatTimeRange(
  startsAt: string,
  endsAt: string,
  timezone: string,
): string {
  const start = toStudioDate(startsAt, timezone);
  const end = toStudioDate(endsAt, timezone);
  const startText = `${format(start, DAY_FORMAT)}, ${format(start, TIME_FORMAT)}`;
  const endText = isSameDay(start, end)
    ? format(end, TIME_FORMAT)
    : `${format(end, DAY_FORMAT)}, ${format(end, TIME_FORMAT)}`;
  return `${startText} – ${endText}`;
}

export function getWeekStart(value: Date, timezone: string): TZDate {
  const studioDate = new TZDate(value, timezone);
  return startOfWeek(studioDate, { weekStartsOn: MONDAY });
}

export function buildWeekDays(weekStart: TZDate, dayCount: number): TZDate[] {
  return Array.from({ length: dayCount }, (_, index) =>
    addDays(weekStart, index),
  );
}

/** Wall-clock string for the API, e.g. "2026-10-29T13:00". */
export function buildWallClockTime(date: string, time: string): string {
  return `${date}T${time}`;
}

export interface WallClockParts {
  date: string;
  time: string;
}

export function splitWallClockTime(
  value: string,
  timezone: string,
): WallClockParts {
  const studioDate = toStudioDate(value, timezone);
  return {
    date: format(studioDate, DATE_INPUT_FORMAT),
    time: format(studioDate, TIME_INPUT_FORMAT),
  };
}

/** Every time of day on the booking step, e.g. ["00:00", "00:15", ...]. */
export function buildTimeOptions(stepMinutes: number): string[] {
  const minutesPerDay = 24 * 60;
  const optionCount = minutesPerDay / stepMinutes;
  return Array.from({ length: optionCount }, (_, index) => {
    const totalMinutes = index * stepMinutes;
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  });
}

/** The wall-clock date and time `hours` after the given studio date and time. */
export function addHoursToWallClock(
  parts: WallClockParts,
  hours: number,
  timezone: string,
): WallClockParts {
  const [year, month, day] = parts.date.split("-").map(Number);
  const [hour, minute] = parts.time.split(":").map(Number);
  const start = new TZDate(year, month - 1, day, hour, minute, timezone);
  const end = addHours(start, hours);
  return {
    date: format(end, DATE_INPUT_FORMAT),
    time: format(end, TIME_INPUT_FORMAT),
  };
}

/** Wall-clock strings for the whole of `day`, for availability queries. */
export function buildDayRange(day: TZDate): {
  startsAt: string;
  endsAt: string;
} {
  const dayStart = startOfDay(day);
  const nextDayStart = addDays(dayStart, 1);
  return {
    startsAt: buildWallClockTime(format(dayStart, DATE_INPUT_FORMAT), "00:00"),
    endsAt: buildWallClockTime(
      format(nextDayStart, DATE_INPUT_FORMAT),
      "00:00",
    ),
  };
}

export function formatDateInput(day: Date): string {
  return format(day, DATE_INPUT_FORMAT);
}

const LAST_START_HOUR = 23;

/**
 * The start time a new booking form opens with: the usual start hour, or the
 * next full hour when that has already passed today.
 */
export function pickDefaultStartTime(
  day: Date,
  now: Date,
  defaultHour: number,
): string {
  const nextHour = Math.min(now.getHours() + 1, LAST_START_HOUR);
  const hasDefaultPassed = isSameDay(day, now) && nextHour > defaultHour;
  const startHour = hasDefaultPassed ? nextHour : defaultHour;
  return `${String(startHour).padStart(2, "0")}:00`;
}
