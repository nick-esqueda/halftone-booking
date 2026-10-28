import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";

import type { BusySlot } from "../../api/types";
import {
  buildHourMarks,
  computeBlockPosition,
  computeNowPercent,
  computeTimeAtFraction,
  countHiddenBookings,
  countHours,
  HOUR_RANGES,
} from "./dayLayout";

const ZONE = "America/Chicago";
const THURSDAY = new TZDate(2026, 9, 29, 0, 0, ZONE);
const FALL_BACK_DAY = new TZDate(2026, 10, 1, 0, 0, ZONE);
const STEP_MINUTES = 15;
const VISIBLE_HOUR_COUNT = countHours(HOUR_RANGES.studioHours);
const ALL_DAY = HOUR_RANGES.allDay;

describe("computeBlockPosition", () => {
  it("places a booking inside the visible hours", () => {
    // 10:00-12:00 Chicago in a 07:00-22:00 window.
    const position = computeBlockPosition(
      "2026-10-29T15:00:00Z",
      "2026-10-29T17:00:00Z",
      THURSDAY,
    );
    expect(position?.leftPercent).toBeCloseTo((3 / VISIBLE_HOUR_COUNT) * 100);
    expect(position?.widthPercent).toBeCloseTo((2 / VISIBLE_HOUR_COUNT) * 100);
  });

  it("clips a booking that started the day before", () => {
    const position = computeBlockPosition(
      "2026-10-28T20:00:00Z",
      "2026-10-29T14:00:00Z",
      THURSDAY,
    );
    expect(position?.leftPercent).toBe(0);
  });

  it("hides a booking outside the visible hours", () => {
    const position = computeBlockPosition(
      "2026-10-29T08:00:00Z",
      "2026-10-29T10:00:00Z",
      THURSDAY,
    );
    expect(position).toBeNull();
  });

  it("lines up with wall-clock hours on the fall-back day", () => {
    // 10:00 CST is 16:00 UTC after the change.
    const position = computeBlockPosition(
      "2026-11-01T16:00:00Z",
      "2026-11-01T17:00:00Z",
      FALL_BACK_DAY,
    );
    expect(position?.leftPercent).toBeCloseTo((3 / VISIBLE_HOUR_COUNT) * 100);
  });
});

describe("computeNowPercent", () => {
  it("places the current time inside the visible hours", () => {
    // 10:30 Chicago, 3.5 hours after 07:00.
    const now = new Date("2026-10-29T15:30:00Z");
    expect(computeNowPercent(THURSDAY, now)).toBeCloseTo(
      (3.5 / VISIBLE_HOUR_COUNT) * 100,
    );
  });

  it("hides the line on other days", () => {
    const nextDay = new Date("2026-10-30T15:30:00Z");
    expect(computeNowPercent(THURSDAY, nextDay)).toBeNull();
  });

  it("hides the line before the visible hours", () => {
    // 06:00 Chicago.
    const early = new Date("2026-10-29T11:00:00Z");
    expect(computeNowPercent(THURSDAY, early)).toBeNull();
  });
});

describe("computeTimeAtFraction", () => {
  it("snaps down to the time step", () => {
    const fraction = (3 + 20 / 60) / VISIBLE_HOUR_COUNT;
    expect(computeTimeAtFraction(THURSDAY, fraction, STEP_MINUTES)).toBe(
      "10:15",
    );
  });

  it("clamps clicks outside the timeline", () => {
    expect(computeTimeAtFraction(THURSDAY, -0.2, STEP_MINUTES)).toBe("07:00");
  });
});

describe("buildHourMarks", () => {
  it("labels each visible hour", () => {
    const marks = buildHourMarks(THURSDAY);
    expect(marks[0]).toEqual({ label: "7 AM", percent: 0 });
    expect(marks).toHaveLength(VISIBLE_HOUR_COUNT);
  });

  it("spaces all 24 hours by the real time on the fall-back day", () => {
    // 25 hours long: 1 AM happens twice, so 2 AM is 3 hours in.
    const marks = buildHourMarks(FALL_BACK_DAY, ALL_DAY);
    expect(marks[0]).toEqual({ label: "12 AM", percent: 0 });
    expect(marks[2].percent).toBeCloseTo((3 / 25) * 100);
    // Every other hour is labelled, so the labels don't crowd.
    expect(marks[1].label).toBeNull();
    expect(marks[2].label).toBe("2 AM");
  });
});

describe("all-day hours", () => {
  it("places a booking against all 24 hours", () => {
    // 03:00-05:00 Chicago.
    const position = computeBlockPosition(
      "2026-10-29T08:00:00Z",
      "2026-10-29T10:00:00Z",
      THURSDAY,
      ALL_DAY,
    );
    expect(position?.leftPercent).toBeCloseTo((3 / 24) * 100);
  });

  it("books the last step of the day, not the next midnight", () => {
    expect(computeTimeAtFraction(THURSDAY, 1, STEP_MINUTES, ALL_DAY)).toBe(
      "23:45",
    );
  });
});

describe("which edges continue", () => {
  it("marks a booking from the day before as continuing before", () => {
    // Wed 6 PM to Thu 12 PM Chicago.
    const position = computeBlockPosition(
      "2026-10-28T23:00:00Z",
      "2026-10-29T17:00:00Z",
      THURSDAY,
    );
    expect(position).toMatchObject({
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it("marks a booking past the visible hours as continuing after", () => {
    // Thu 9 PM to 11 PM Chicago.
    const position = computeBlockPosition(
      "2026-10-30T02:00:00Z",
      "2026-10-30T04:00:00Z",
      THURSDAY,
    );
    expect(position).toMatchObject({
      continuesBefore: false,
      continuesAfter: true,
    });
  });
});

describe("countHiddenBookings", () => {
  const slot = (id: number, startsAt: string, endsAt: string): BusySlot => ({
    booking_id: id,
    booker_name: "Priya",
    purpose: "",
    starts_at: startsAt,
    ends_at: endsAt,
  });
  // 05:00-06:00 Chicago, on two items of the same booking.
  const early = slot(1, "2026-10-29T10:00:00Z", "2026-10-29T11:00:00Z");
  // 10:00-12:00 Chicago.
  const visible = slot(2, "2026-10-29T15:00:00Z", "2026-10-29T17:00:00Z");
  // Friday 05:00-06:00 Chicago.
  const nextDay = slot(3, "2026-10-30T10:00:00Z", "2026-10-30T11:00:00Z");

  it("counts each booking entirely outside the hours once", () => {
    const slots = [early, early, visible, nextDay];
    expect(countHiddenBookings(slots, THURSDAY, HOUR_RANGES.studioHours)).toBe(
      1,
    );
  });

  it("counts nothing when all hours are shown", () => {
    expect(countHiddenBookings([early], THURSDAY, ALL_DAY)).toBe(0);
  });
});
