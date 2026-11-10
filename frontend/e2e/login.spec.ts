/**
 * Logging in and out against the real API (E1-E7). There are no passwords:
 * any seeded username logs in, and nobody else can.
 */
import { expect, test } from "@playwright/test";

import { logInAs, switchUser } from "./session";

// Seeded users this spec logs in as.
const USER = "Tyler";
const OTHER_USER = "Morgan";

test("a fresh visit lands on a login page with nothing else on it", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await expect(page.getByLabel("Username")).toBeVisible();
  const pageText = await page.locator("body").innerText();
  expect(pageText).not.toMatch(/Camera|Lighting|Podcast|AM|PM|Booking as/);
});

test("the login page asks the API nothing until Log in is pressed", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push(request.url());
    }
  });

  await page.goto("/login");
  await page.getByLabel("Username").fill(USER);
  await page.waitForTimeout(1000);
  expect(apiRequests).toEqual([]);

  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  expect(apiRequests[0]).toMatch(/\/api\/login$/);
});

test("usernames match whatever the capitals", async ({ page }) => {
  await logInAs(page, USER.toLowerCase());
  await expect(page.getByRole("banner")).toContainText(`Signed in as${USER}`);
});

test("a name that isn't a user can't log in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("Nobody Here");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "No user named Nobody Here. Check the spelling.",
  );
  await expect(page).toHaveURL(/\/login$/);
});

test("the session survives a reload", async ({ page }) => {
  await logInAs(page, USER);

  await page.reload();

  await expect(page.getByRole("banner")).toContainText(USER);
  await expect(page.getByTestId("row-1")).toBeVisible();
});

test("Log out returns to an empty login page and stays there", async ({
  page,
}) => {
  await logInAs(page, USER);

  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Username")).toHaveValue("");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page.getByLabel("Username")).toBeVisible();
});

test("logging out in one tab logs out the others", async ({ context }) => {
  const firstTab = await context.newPage();
  await logInAs(firstTab, USER);
  const secondTab = await context.newPage();
  await secondTab.goto("/");
  await expect(secondTab.getByRole("banner")).toContainText(USER);

  await firstTab.getByRole("button", { name: "Log out" }).click();

  await expect(secondTab).toHaveURL(/\/login$/);
});

test("switching user shows the new name", async ({ page }) => {
  await logInAs(page, USER);

  await switchUser(page, OTHER_USER);

  await expect(page.getByRole("banner")).toContainText(OTHER_USER);
  await expect(page.getByRole("banner")).not.toContainText(USER);
});
