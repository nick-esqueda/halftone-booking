import { describe, expect, it } from "vitest";

import { describeInViewerTime, describeZone, getZoneCity } from "./viewerTime";

const STUDIO_ZONE = "America/Chicago";
// Thu 29 Oct, 10:00-12:00 Chicago.
const STARTS_AT = "2026-10-29T15:00:00Z";
const ENDS_AT = "2026-10-29T17:00:00Z";

describe("describeInViewerTime", () => {
  it("is null for someone in the studio's zone", () => {
    expect(
      describeInViewerTime(STARTS_AT, ENDS_AT, STUDIO_ZONE, STUDIO_ZONE),
    ).toBeNull();
  });

  it("gives the time and day for someone far away", () => {
    expect(
      describeInViewerTime(STARTS_AT, ENDS_AT, STUDIO_ZONE, "Asia/Tokyo"),
    ).toBe("Fri 30 Oct, 12:00 AM – 2:00 AM your time (Tokyo)");
  });

  it("is null for another zone that reads the same right now", () => {
    expect(
      describeInViewerTime(STARTS_AT, ENDS_AT, STUDIO_ZONE, "America/Winnipeg"),
    ).toBeNull();
  });
});

describe("zone names", () => {
  it("reads the city from the zone id", () => {
    expect(getZoneCity("America/New_York")).toBe("New York");
  });

  it("describes the studio zone", () => {
    expect(describeZone(STUDIO_ZONE)).toBe("Central Time (Chicago)");
  });
});
