/**
 * Smoke test of the main flow against the real API and database:
 * book, see a clash, edit, cancel.
 *
 * Everything happens next week so the run never depends on the time of day,
 * and every booking is cancelled at the end so the test can run again.
 * playwright.config.ts runs this file twice: with the browser in the studio's
 * timezone and in Tokyo, a day ahead.
 */
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const DAY_VIEW_START_HOUR = 7;
const HOUR_ROW_HEIGHT_PX = 48;
const CLICK_OFFSET_PX = 4;
const CAMERA_A_ID = 1;
const CAMERA_B_ID = 2;
const STUDIO_TIMEZONE = "America/Chicago";
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

interface BookingResponse {
  id: number;
  version: number;
}

async function createBookingThroughApi(
  page: Page,
  request: { bookerName: string; date: string; start: string; end: string },
): Promise<BookingResponse> {
  const response = await page.request.post("/api/bookings", {
    data: {
      booker_name: request.bookerName,
      purpose: "",
      equipment_ids: [CAMERA_A_ID],
      starts_at: `${request.date}T${request.start}`,
      ends_at: `${request.date}T${request.end}`,
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function cancelThroughApi(page: Page, booking: BookingResponse) {
  const response = await page.request.post(
    `/api/bookings/${booking.id}/cancel`,
    { data: { actor_name: SECOND_BOOKER, version: booking.version } },
  );
  expect(response.status()).toBe(200);
}

interface ListedBooking extends BookingResponse {
  booker_name: string;
  is_cancelled: boolean;
}

/** Cancels anything a previous, failed run left behind. */
async function cancelLeftoverBookings(request: APIRequestContext) {
  for (const bookerName of [FIRST_BOOKER, SECOND_BOOKER]) {
    const response = await request.get("/api/bookings", {
      params: { booker_name: bookerName },
    });
    const bookings: ListedBooking[] = await response.json();
    const activeBookings = bookings.filter((booking) => !booking.is_cancelled);
    for (const booking of activeBookings) {
      await request.post(`/api/bookings/${booking.id}/cancel`, {
        data: { actor_name: bookerName, version: booking.version },
      });
    }
  }
}

test.beforeEach(async ({ request }) => {
  await cancelLeftoverBookings(request);
});

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
  const rival = await createBookingThroughApi(page, {
    bookerName: SECOND_BOOKER,
    date: startDate,
    start: "15:00",
    end: "16:00",
  });

  await dialog.getByRole("button", { name: "Book 1 item" }).click();
  await expect(
    dialog.getByText(`Camera A is already booked by ${SECOND_BOOKER}`),
  ).toBeVisible();

  await cancelThroughApi(page, rival);
});

test("an edit that lost a race shows the newer version", async ({ page }) => {
  await page.goto("/");
  await openNextWednesday(page);
  await clickSlot(page, CAMERA_A_ID, 17);
  const dialog = page.getByRole("dialog");
  const date = await dialog.getByLabel("Start date").inputValue();
  await page.keyboard.press("Escape");
  const booking = await createBookingThroughApi(page, {
    bookerName: SECOND_BOOKER,
    date,
    start: "17:00",
    end: "18:00",
  });

  await page.reload();
  await openNextWednesday(page);
  await page
    .getByRole("button", { name: `${SECOND_BOOKER} · 17:00–18:00` })
    .click();

  // Someone else extends it while this dialog is open.
  const theirEdit = await page.request.put(`/api/bookings/${booking.id}`, {
    data: {
      booker_name: SECOND_BOOKER,
      purpose: "",
      equipment_ids: [CAMERA_A_ID],
      starts_at: `${date}T17:00`,
      ends_at: `${date}T19:00`,
      version: booking.version,
    },
  });
  expect(theirEdit.status()).toBe(200);

  await dialog.getByLabel("End time").selectOption("18:30");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(dialog.getByRole("alert")).toContainText(
    "Someone else changed this booking",
  );
  await expect(dialog.getByLabel("End time")).toHaveValue("19:00");
  await cancelThroughApi(page, await theirEdit.json());
});

test("shows the viewer's own time when it differs from the studio's", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await openNextWednesday(page);
  await clickSlot(page, CAMERA_A_ID, 10);

  const hint = page.getByRole("dialog").getByText(/your time/);
  const isAwayFromStudio = testInfo.project.use.timezoneId !== STUDIO_TIMEZONE;
  if (isAwayFromStudio) {
    // 10:00 Wednesday in Chicago is early Thursday in Tokyo. The exact
    // hour depends on daylight saving; unit tests pin that down.
    await expect(hint).toHaveText(/^That's Thu .* your time \(Tokyo\)\.$/);
  } else {
    await expect(hint).toHaveCount(0);
  }
});
