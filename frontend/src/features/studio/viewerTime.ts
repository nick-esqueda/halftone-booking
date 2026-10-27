/**
 * Hints for people booking from another timezone. The app always works in
 * studio time; these only add "that's 12:00 AM your time" lines alongside it.
 * Every function takes the viewer's zone as an argument so tests can pick it.
 */
import { formatTimeRange } from "./studioTime";

const ZONE_NAME_STYLE = "longGeneric";

/** The timezone the viewer's device is set to, e.g. "Asia/Tokyo". */
export function getViewerTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** "Tokyo" from "Asia/Tokyo"; "New York" from "America/New_York". */
export function getZoneCity(timezone: string): string {
  const lastPart = timezone.split("/").at(-1) ?? timezone;
  return lastPart.replace(/_/g, " ");
}

/** A readable zone name, e.g. "Central Time (Chicago)". */
export function describeZone(timezone: string): string {
  const zoneNamePart = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: ZONE_NAME_STYLE,
  })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName");
  const zoneName = zoneNamePart?.value ?? timezone;
  return `${zoneName} (${getZoneCity(timezone)})`;
}

/**
 * The range in the viewer's own time, e.g. "Fri 30 Oct, 12:00 AM – 2:00 AM your
 * time (Tokyo)", or null when it reads the same as in studio time.
 */
export function describeInViewerTime(
  startsAt: string,
  endsAt: string,
  studioTimezone: string,
  viewerTimezone: string,
): string | null {
  const studioText = formatTimeRange(startsAt, endsAt, studioTimezone);
  const viewerText = formatTimeRange(startsAt, endsAt, viewerTimezone);
  if (viewerText === studioText) {
    return null;
  }
  return `${viewerText} your time (${getZoneCity(viewerTimezone)})`;
}
