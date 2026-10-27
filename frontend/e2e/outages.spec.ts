/**
 * What people see when the API is down or failing. Requests are intercepted
 * in the browser, so the real API keeps running for the other tests.
 */
import { expect, test } from "@playwright/test";

const AVAILABILITY_URL = "**/api/availability**";
const BOOKINGS_URL = "**/api/bookings";
const UNAVAILABLE_BODY = {
  code: "service_unavailable",
  message: "Booking is temporarily unavailable. Please try again in a minute.",
  conflicts: [],
};

test("the schedule explains an outage and recovers on Try again", async ({
  page,
}) => {
  await page.route(AVAILABILITY_URL, (route) =>
    route.fulfill({ status: 503, json: UNAVAILABLE_BODY }),
  );
  await page.goto("/");

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Couldn't load the schedule.");
  await expect(alert).toContainText("temporarily unavailable");

  await page.unroute(AVAILABILITY_URL);
  await alert.getByRole("button", { name: "Try again" }).click();

  await expect(alert).toBeHidden();
  await expect(page.getByTestId("row-1")).toBeVisible();
});

test("a booking that can't reach the server keeps the form", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill("E2E Outage");
  await page.getByRole("button", { name: "Next week" }).click();
  await page.getByRole("button", { name: "+ New booking" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /Camera A/ }).check();
  await dialog.getByLabel("Purpose").fill("Interview");

  await page.route(BOOKINGS_URL, (route) => route.abort("connectionrefused"));
  await dialog.getByRole("button", { name: "Book 1 item" }).click();

  await expect(dialog.getByRole("alert")).toContainText(
    "Can't reach the booking server",
  );
  await expect(dialog.getByLabel("Purpose")).toHaveValue("Interview");
});
