/**
 * Geometry for the day timeline: where a booking sits inside the visible
 * hours, and which time a click lands on. Pure functions, easy to test.
 * `setHours` works in studio wall-clock time, so daylight-saving days line up.
 */
import type { TZDate } from "@date-fns/tz";
import { addMinutes, format, setHours } from "date-fns";

import { DAY_VIEW_END_HOUR, DAY_VIEW_START_HOUR } from "../../config/constants";

export interface BlockPosition {
  topPercent: number;
  heightPercent: number;
}

const PERCENT = 100;
const MINUTES_PER_HOUR = 60;
const TIME_FORMAT = "HH:mm";

export const VISIBLE_HOUR_COUNT = DAY_VIEW_END_HOUR - DAY_VIEW_START_HOUR;

function getVisibleWindow(day: TZDate): { start: number; end: number } {
  const start = setHours(day, DAY_VIEW_START_HOUR).getTime();
  const end = setHours(day, DAY_VIEW_END_HOUR).getTime();
  return { start, end };
}

/** Where a slot sits inside `day`'s visible hours, or null if it isn't visible that day. */
export function computeBlockPosition(
  startsAt: string,
  endsAt: string,
  day: TZDate,
): BlockPosition | null {
  const visible = getVisibleWindow(day);
  const clippedStart = Math.max(new Date(startsAt).getTime(), visible.start);
  const clippedEnd = Math.min(new Date(endsAt).getTime(), visible.end);
  if (clippedEnd <= clippedStart) {
    return null;
  }

  const windowLength = visible.end - visible.start;
  return {
    topPercent: ((clippedStart - visible.start) / windowLength) * PERCENT,
    heightPercent: ((clippedEnd - clippedStart) / windowLength) * PERCENT,
  };
}

/** The studio time ("HH:mm") at a vertical fraction of the timeline, snapped down to the step. */
export function computeTimeAtFraction(
  day: TZDate,
  fraction: number,
  stepMinutes: number,
): string {
  const visibleMinutes = VISIBLE_HOUR_COUNT * MINUTES_PER_HOUR;
  const clampedFraction = Math.min(Math.max(fraction, 0), 1);
  const minutesIntoWindow = clampedFraction * visibleMinutes;
  const snappedMinutes =
    Math.floor(minutesIntoWindow / stepMinutes) * stepMinutes;
  const windowStart = setHours(day, DAY_VIEW_START_HOUR);
  return format(addMinutes(windowStart, snappedMinutes), TIME_FORMAT);
}

/** Labels for the hour lines, e.g. ["07:00", "08:00", ...]. */
export function buildHourLabels(): string[] {
  return Array.from({ length: VISIBLE_HOUR_COUNT }, (_, index) => {
    const hour = DAY_VIEW_START_HOUR + index;
    return `${String(hour).padStart(2, "0")}:00`;
  });
}
