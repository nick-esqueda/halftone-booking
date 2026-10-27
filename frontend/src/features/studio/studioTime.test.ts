import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";

import {
  addHoursToWallClock,
  buildDayRange,
  getWeekStart,
  parseWallClock,
  pickDefaultStartTime,
  splitWallClockTime,
} from "./studioTime";

const ZONE = "America/Chicago";
const DEFAULT_HOUR = 9;

describe("splitWallClockTime", () => {
  it("shows an API time in studio time", () => {
    const parts = splitWallClockTime("2026-10-29T18:00:00Z", ZONE);
    expect(parts).toEqual({ date: "2026-10-29", time: "13:00" });
  });
});

describe("addHoursToWallClock", () => {
  it("rolls over midnight", () => {
    const end = addHoursToWallClock(
      { date: "2026-10-29", time: "23:00" },
      2,
      ZONE,
    );
    expect(end).toEqual({ date: "2026-10-30", time: "01:00" });
  });

  it("counts real hours across the fall-back change", () => {
    const end = addHoursToWallClock(
      { date: "2026-11-01", time: "00:00" },
      3,
      ZONE,
    );
    expect(end).toEqual({ date: "2026-11-01", time: "02:00" });
  });
});

describe("getWeekStart", () => {
  it("starts weeks on Monday in studio time", () => {
    const sunday = new TZDate(2026, 10, 1, 12, 0, ZONE);
    const weekStart = getWeekStart(sunday, ZONE);
    expect(weekStart.getDate()).toBe(26);
    expect(weekStart.getMonth()).toBe(9);
  });
});

describe("buildDayRange", () => {
  it("covers the whole studio day", () => {
    const day = new TZDate(2026, 9, 29, 15, 30, ZONE);
    expect(buildDayRange(day)).toEqual({
      startsAt: "2026-10-29T00:00",
      endsAt: "2026-10-30T00:00",
    });
  });
});

describe("pickDefaultStartTime", () => {
  const today = new TZDate(2026, 9, 27, 0, 0, ZONE);

  it("uses the usual hour on another day", () => {
    const now = new TZDate(2026, 9, 26, 15, 10, ZONE);
    expect(pickDefaultStartTime(today, now, DEFAULT_HOUR)).toBe("09:00");
  });

  it("uses the usual hour early in the morning", () => {
    const now = new TZDate(2026, 9, 27, 7, 10, ZONE);
    expect(pickDefaultStartTime(today, now, DEFAULT_HOUR)).toBe("09:00");
  });

  it("uses the next full hour once the usual hour has passed", () => {
    const now = new TZDate(2026, 9, 27, 14, 10, ZONE);
    expect(pickDefaultStartTime(today, now, DEFAULT_HOUR)).toBe("15:00");
  });
});

describe("parseWallClock", () => {
  it("reads a studio date and time as a moment", () => {
    const moment = parseWallClock({ date: "2026-10-29", time: "10:00" }, ZONE);
    expect(moment.getTime()).toBe(Date.parse("2026-10-29T15:00:00Z"));
  });
});
