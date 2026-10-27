/**
 * Smoke test of the main flow against the real API and database:
 * book, see a clash, edit, cancel.
 *
 * Everything happens next week so the run never depends on the time of day,
 * and every booking is cancelled at the end so the test can run again.
 */
import { expect, test, type Page } from "@playwright/test";

const DAY_VIEW_START_HOUR = 7;
const HOUR_ROW_HEIGHT_PX = 48;
const CLICK_OFFSET_PX = 4;
const CAMERA_A_ID = 1;
const CAMERA_B_ID = 2;
const FIRST_BOOKER = "E2E Ana";
const SECOND_BOOKER = "E2E Ben";

async function setBookerName(page: Page, name: string) {
  await page.getByLabel("Your name").fill(name);
}

async function openNextWednesday(page: Page) {
  await page.getByRole("button", { name: "Next week" }).click();
  await page.getByRole("tab", { name: /Wed/ }).click();
}

/** Clicks an item's column at the given hour, which opens a new booking. */
async function clickSlot(page: Page, equipmentId: number, hour: number) {
  const offsetY = (hour - DAY_VIEW_START_HOUR) * HOUR_ROW_HEIGHT_PX;
  await page
    .getByTestId(`column-${equipmentId}`)
    .click({ position: { x: 10, y: offsetY + CLICK_OFFSET_PX } });
}

async function cancelOpenBooking(page: Page) {
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("book, clash, edit and cancel", async ({ page }) => {
  await page.goto("/");
  await setBookerName(page, FIRST_BOOKER);
  await openNextWednesday(page);

  // Book Camera A, 10:00-12:00.
  await clickSlot(page, CAMERA_A_ID, 10);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Start time")).toHaveValue("10:00");
  await dialog.getByRole("button", { name: "Book 1 item" }).click();
  await expect(dialog).toBeHidden();
  const firstBlock = page.getByRole("button", {
    name: `${FIRST_BOOKER} · 10:00–12:00`,
  });
  await expect(firstBlock).toContainText("You");

  // Someone else sees Camera A as taken at 11:00 and books Camera B.
  await setBookerName(page, SECOND_BOOKER);
  await clickSlot(page, CAMERA_B_ID, 11);
  await expect(dialog.getByText(`Taken by ${FIRST_BOOKER}`)).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: /Camera A/ }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Book 1 item" }).click();
  await expect(dialog).toBeHidden();

  // Edit the first booking: run until 13:00.
  await setBookerName(page, FIRST_BOOKER);
  await firstBlock.click();
  await dialog.getByLabel("End time").selectOption("13:00");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  const editedBlock = page.getByRole("button", {
    name: `${FIRST_BOOKER} · 10:00–13:00`,
  });
  await expect(editedBlock).toBeVisible();

  // Cancel both bookings; the slots free up.
  await editedBlock.click();
  await cancelOpenBooking(page);
  await expect(editedBlock).toBeHidden();
  await page
    .getByRole("button", { name: new RegExp(`^${SECOND_BOOKER}`) })
    .click();
  await cancelOpenBooking(page);
});

test("a booking that lost a race shows the clash", async ({ page }) => {
  await page.goto("/");
  await setBookerName(page, FIRST_BOOKER);
  await openNextWednesday(page);
  await clickSlot(page, CAMERA_A_ID, 15);
  const dialog = page.getByRole("dialog");
  const startDate = await dialog.getByLabel("Start date").inputValue();

  // Another person books the same slot while the dialog is open.
  const rival = await page.request.post("/api/bookings", {
    data: {
      booker_name: SECOND_BOOKER,
      purpose: "",
      equipment_ids: [CAMERA_A_ID],
      starts_at: `${startDate}T15:00`,
      ends_at: `${startDate}T16:00`,
    },
  });
  expect(rival.status()).toBe(201);

  await dialog.getByRole("button", { name: "Book 1 item" }).click();
  await expect(
    dialog.getByText(`Camera A is already booked by ${SECOND_BOOKER}`),
  ).toBeVisible();

  const rivalBooking = await rival.json();
  const cancelled = await page.request.post(
    `/api/bookings/${rivalBooking.id}/cancel`,
    { data: { actor_name: SECOND_BOOKER, version: rivalBooking.version } },
  );
  expect(cancelled.status()).toBe(200);
});
