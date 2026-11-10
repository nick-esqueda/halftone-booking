export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";

/** Where to go after logging in: the page they asked for, else the schedule. */
export function readReturnPath(locationState: unknown): string {
  const from = (locationState as { from?: unknown } | null)?.from;
  const isUsablePath = typeof from === "string" && from !== LOGIN_PATH;
  return isUsablePath ? from : HOME_PATH;
}
