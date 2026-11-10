/**
 * Logging in and out in end-to-end tests. Only seeded users can log in, so
 * every spec books as one of the studio's users (see app/studio_users.py).
 * Each spec uses its own users so their clean-up can't touch each other.
 */
import { expect, type Page } from "@playwright/test";

async function submitLogin(page: Page, username: string) {
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

/** Opens the app logged in as `username`, starting from a fresh browser. */
export async function logInAs(page: Page, username: string) {
  await page.goto("/login");
  await submitLogin(page, username);
}

/** Logs out of the current session and back in as someone else. */
export async function switchUser(page: Page, username: string) {
  await page.getByRole("button", { name: "Log out" }).click();
  await submitLogin(page, username);
}
