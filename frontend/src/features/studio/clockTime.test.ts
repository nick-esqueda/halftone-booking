import { describe, expect, it } from "vitest";

import {
  buildMinuteOptions,
  formatClockValue,
  formatHourLabel,
  joinClockValue,
  splitClockValue,
} from "./clockTime";

describe("splitClockValue and joinClockValue", () => {
  it.each([
    ["00:00", { hour: 12, minute: 0, period: "AM" }],
    ["09:15", { hour: 9, minute: 15, period: "AM" }],
    ["12:00", { hour: 12, minute: 0, period: "PM" }],
    ["23:45", { hour: 11, minute: 45, period: "PM" }],
  ] as const)("converts %s both ways", (value, parts) => {
    expect(splitClockValue(value)).toEqual(parts);
    expect(joinClockValue(parts)).toBe(value);
  });
});

describe("formatClockValue", () => {
  it("shows a 12-hour time with AM or PM", () => {
    expect(formatClockValue("14:30")).toBe("2:30 PM");
    expect(formatClockValue("00:05")).toBe("12:05 AM");
  });
});

describe("formatHourLabel", () => {
  it("labels hours on the timeline", () => {
    expect(formatHourLabel(7)).toBe("7 AM");
    expect(formatHourLabel(12)).toBe("12 PM");
    expect(formatHourLabel(22)).toBe("10 PM");
  });
});

describe("buildMinuteOptions", () => {
  it("lists each step within an hour", () => {
    expect(buildMinuteOptions(15)).toEqual([0, 15, 30, 45]);
  });
});
