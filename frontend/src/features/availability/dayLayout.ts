/**
 * Geometry for the day timeline, where hours run left to right: where a
 * booking sits inside the visible hours, and which time a click lands on.
 * Pure functions, easy to test. `setHours` works in studio wall-clock time,
 * so daylight-saving days line up.
 */
import type { TZDate } from "@date-fns/tz";
import { addMinutes, format, setHours } from "date-fns";

import type { BusySlot } from "../../api/types";
import {
  DAY_VIEW_END_HOUR,
  DAY_VIEW_START_HOUR,
  MIN_ALL_DAY_HOUR_WIDTH_PX,
  MIN_HOUR_WIDTH_PX,
} from "../../config/constants";
import { formatHourLabel } from "../studio/clockTime";

/** The hours the timeline shows, in studio time; 24 is the next midnight. */
export interface HourRange {
  startHour: number;
  endHour: number;
  /** Narrower than this and the timeline scrolls sideways instead of squashing. */
  minHourWidthPx: number;
  /** Label every this many hours; the lines still mark every hour. */
  labelEveryHours: number;
}

export type HourRangeName = "studioHours" | "allDay";

export const HOUR_RANGES: Record<HourRangeName, HourRange> = {
  studioHours: {
    startHour: DAY_VIEW_START_HOUR,
    endHour: DAY_VIEW_END_HOUR,
    minHourWidthPx: MIN_HOUR_WIDTH_PX,
    labelEveryHours: 1,
  },
  // Narrower hours, so all 24 fit across a laptop screen.
  allDay: {
    startHour: 0,
    endHour: 24,
    minHourWidthPx: MIN_ALL_DAY_HOUR_WIDTH_PX,
    labelEveryHours: 2,
  },
};

const DEFAULT_RANGE = HOUR_RANGES.studioHours;

// How each choice of hours is named, on the toggle and in the day heading.
export const HOUR_RANGE_LABELS: Record<HourRangeName, string> = {
  studioHours: `${formatHourLabel(DEFAULT_RANGE.startHour)}–${formatHourLabel(DEFAULT_RANGE.endHour)}`,
  allDay: "All day",
};

export interface BlockPosition {
  leftPercent: number;
  widthPercent: number;
  /** The booking starts before the visible hours. */
  continuesBefore: boolean;
  /** The booking ends after the visible hours. */
  continuesAfter: boolean;
}

export interface HourMark {
  /** Null on hours that get a line but no label. */
  label: string | null;
  percent: number;
}

const PERCENT = 100;
const MS_PER_MINUTE = 60_000;
const TIME_FORMAT = "HH:mm";

export function countHours(range: HourRange): number {
  return range.endHour - range.startHour;
}

function getVisibleWindow(
  day: TZDate,
  range: HourRange,
): { start: number; end: number } {
  const start = setHours(day, range.startHour).getTime();
  const end = setHours(day, range.endHour).getTime();
  return { start, end };
}

/** Where a slot sits inside `day`'s visible hours, or null if it isn't visible that day. */
export function computeBlockPosition(
  startsAt: string,
  endsAt: string,
  day: TZDate,
  range: HourRange = DEFAULT_RANGE,
): BlockPosition | null {
  const visible = getVisibleWindow(day, range);
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const clippedStart = Math.max(start, visible.start);
  const clippedEnd = Math.min(end, visible.end);
  if (clippedEnd <= clippedStart) {
    return null;
  }

  const windowLength = visible.end - visible.start;
  return {
    leftPercent: ((clippedStart - visible.start) / windowLength) * PERCENT,
    widthPercent: ((clippedEnd - clippedStart) / windowLength) * PERCENT,
    continuesBefore: start < visible.start,
    continuesAfter: end > visible.end,
  };
}

/** How far across `day`'s visible hours `now` is, or null if it's another day or outside them. */
export function computeNowPercent(
  day: TZDate,
  now: Date,
  range: HourRange = DEFAULT_RANGE,
): number | null {
  const visible = getVisibleWindow(day, range);
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
  range: HourRange = DEFAULT_RANGE,
): string {
  const visible = getVisibleWindow(day, range);
  const visibleMinutes = (visible.end - visible.start) / MS_PER_MINUTE;
  const clampedFraction = Math.min(Math.max(fraction, 0), 1);
  const minutesIntoWindow = clampedFraction * visibleMinutes;
  const snappedMinutes =
    Math.floor(minutesIntoWindow / stepMinutes) * stepMinutes;
  const lastStart = visibleMinutes - stepMinutes;
  const windowStart = setHours(day, range.startHour);
  const minutes = Math.min(snappedMinutes, lastStart);
  return format(addMinutes(windowStart, minutes), TIME_FORMAT);
}

/**
 * A label and position for each visible hour, e.g. "7 AM" at 0%. Positions
 * come from the real times, so a 23- or 25-hour day still lines up.
 */
export function buildHourMarks(
  day: TZDate,
  range: HourRange = DEFAULT_RANGE,
): HourMark[] {
  const visible = getVisibleWindow(day, range);
  const windowLength = visible.end - visible.start;
  return Array.from({ length: countHours(range) }, (_, index) => {
    const hour = range.startHour + index;
    const time = setHours(day, hour).getTime();
    return {
      label: index % range.labelEveryHours === 0 ? formatHourLabel(hour) : null,
      percent: ((time - visible.start) / windowLength) * PERCENT,
    };
  });
}

/** How many bookings on `day` fall entirely outside the visible hours. */
export function countHiddenBookings(
  slots: BusySlot[],
  day: TZDate,
  range: HourRange,
): number {
  const isOnDay = (slot: BusySlot) =>
    computeBlockPosition(slot.starts_at, slot.ends_at, day, HOUR_RANGES.allDay);
  const isVisible = (slot: BusySlot) =>
    computeBlockPosition(slot.starts_at, slot.ends_at, day, range);
  const hidden = slots.filter((slot) => isOnDay(slot) && !isVisible(slot));
  return new Set(hidden.map((slot) => slot.booking_id)).size;
}
