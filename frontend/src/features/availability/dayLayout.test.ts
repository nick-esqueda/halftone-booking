import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";

import {
  buildHourLabels,
  computeBlockPosition,
  computeNowPercent,
  computeTimeAtFraction,
  VISIBLE_HOUR_COUNT,
} from "./dayLayout";

const ZONE = "America/Chicago";
const THURSDAY = new TZDate(2026, 9, 29, 0, 0, ZONE);
const FALL_BACK_DAY = new TZDate(2026, 10, 1, 0, 0, ZONE);
const STEP_MINUTES = 15;

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

describe("buildHourLabels", () => {
  it("labels each visible hour", () => {
    const labels = buildHourLabels();
    expect(labels[0]).toBe("7 AM");
    expect(labels).toHaveLength(VISIBLE_HOUR_COUNT);
  });
});
