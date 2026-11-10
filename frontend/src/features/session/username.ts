import { USERNAME_MAX_LENGTH } from "../../config/constants";

/** Trim and collapse spaces, as the API does, so "  Sam   K " is "Sam K". */
export function normalizeUsername(rawUsername: string): string {
  return rawUsername.split(/\s+/).filter(Boolean).join(" ");
}

interface UsernameCheck {
  isFailing: (username: string) => boolean;
  message: string;
}

const USERNAME_CHECKS: UsernameCheck[] = [
  {
    isFailing: (username) => username === "",
    message: "Enter your name to continue.",
  },
  {
    isFailing: (username) => username.length > USERNAME_MAX_LENGTH,
    message: `Usernames are at most ${USERNAME_MAX_LENGTH} characters.`,
  },
];

/** Why a typed username can't be sent, or null when it can. */
export function findUsernameProblem(rawUsername: string): string | null {
  const username = normalizeUsername(rawUsername);
  const failingCheck = USERNAME_CHECKS.find((check) =>
    check.isFailing(username),
  );
  return failingCheck?.message ?? null;
}
