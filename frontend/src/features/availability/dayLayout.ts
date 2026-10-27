/**
 * Geometry for the day timeline, where hours run left to right: where a
 * booking sits inside the visible hours, and which time a click lands on. Pure functions, easy to test.
 * `setHours` works in studio wall-clock time, so daylight-saving days line up.
 */
import type { TZDate } from "@date-fns/tz";
import { addMinutes, format, setHours } from "date-fns";

import { DAY_VIEW_END_HOUR, DAY_VIEW_START_HOUR } from "../../config/constants";
import { formatHourLabel } from "../studio/clockTime";

export interface BlockPosition {
  leftPercent: number;
  widthPercent: number;
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
    leftPercent: ((clippedStart - visible.start) / windowLength) * PERCENT,
    widthPercent: ((clippedEnd - clippedStart) / windowLength) * PERCENT,
  };
}

/** How far across `day`'s visible hours `now` is, or null if it's another day or outside them. */
export function computeNowPercent(day: TZDate, now: Date): number | null {
  const visible = getVisibleWindow(day);
  const nowTime = now.getTime();
  const isVisible = visible.start <= nowTime && nowTime < visible.end;
  if (!isVisible) {
    return null;
  }

  const windowLength = visible.end - visible.start;
  return ((nowTime - visible.start) / windowLength) * PERCENT;
}

/** The studio time ("HH:mm") at a horizontal fraction of the timeline, snapped down to the step. */
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

/** Labels for the hour lines, e.g. ["7 AM", "8 AM", ...]. */
export function buildHourLabels(): string[] {
  return Array.from({ length: VISIBLE_HOUR_COUNT }, (_, index) =>
    formatHourLabel(DAY_VIEW_START_HOUR + index),
  );
}
