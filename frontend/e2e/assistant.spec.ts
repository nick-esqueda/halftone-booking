/**
 * The booking assistant, from question to saved booking, change and
 * cancellation. The assistant's reply is intercepted in the browser (no model
 * runs in CI); saving goes through the real API and database.
 */
import { TZDate } from "@date-fns/tz";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { addDays, format } from "date-fns";

const STUDIO_TIMEZONE = "America/Chicago";
const BOOKER = "E2E Assistant";
const CAMERA_C_ID = 3;
// Far enough ahead that the time is never in the past or on a busy day.
const DAYS_AHEAD = 9;
const CONFIG_URL = "**/api/config";
const ASSISTANT_URL = "**/api/assistant/draft";

const TEST_DAY = addDays(TZDate.tz(STUDIO_TIMEZONE), DAYS_AHEAD);
const STUDIO_DATE = format(TEST_DAY, "yyyy-MM-dd");

/** An instant at `hour` o'clock studio time on the test day. */
function atStudioHour(hour: number): string {
  const year = TEST_DAY.getFullYear();
  const month = TEST_DAY.getMonth();
  const date = TEST_DAY.getDate();
  return new TZDate(year, month, date, hour, 0, STUDIO_TIMEZONE).toISOString();
}

const AFTERNOON = {
  equipment_ids: [CAMERA_C_ID],
  starts_at: atStudioHour(16),
  ends_at: atStudioHour(18),
  purpose: "Assistant test",
};

interface ListedBooking {
  id: number;
  version: number;
  is_cancelled: boolean;
}

/** Cancels anything a previous, failed run left behind. */
async function cancelLeftoverBookings(request: APIRequestContext) {
  const response = await request.get("/api/bookings", {
    params: { booker_name: BOOKER },
  });
  const bookings: ListedBooking[] = await response.json();
  for (const booking of bookings.filter((item) => !item.is_cancelled)) {
    await request.post(`/api/bookings/${booking.id}/cancel`, {
      data: { actor_name: BOOKER, version: booking.version },
    });
  }
}

test.beforeEach(async ({ page, request }) => {
  await cancelLeftoverBookings(request);
  // Switch the assistant on in the UI, whatever the server says.
  await page.route(CONFIG_URL, async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({
      response,
      json: { ...config, assistant_enabled: true },
    });
  });
});

test("a draft from the assistant is reviewed, then booked", async ({
  page,
}) => {
  const reply = {
    kind: "draft",
    message: "Here's Camera C for that afternoon.",
    draft: AFTERNOON,
    options: [],
  };
  await page.route(ASSISTANT_URL, (route) => route.fulfill({ json: reply }));
  await page.goto("/");
  await page.getByLabel("Your name").fill(BOOKER);

  await page
    .getByLabel("Ask the booking assistant")
    .fill("Camera C next week at 4 for the assistant test");
  await page.getByRole("button", { name: "Ask" }).click();

  const dialog = page.getByRole("dialog", { name: "New booking" });
  await expect(dialog.getByLabel("Start date")).toHaveValue(STUDIO_DATE);
  await expect(dialog.getByLabel("Purpose")).toHaveValue("Assistant test");
  await dialog.getByRole("button", { name: "Book 1 item" }).click();
  await expect(dialog).toBeHidden();

  const block = page.getByRole("button", {
    name: `${BOOKER} · 4:00 PM–6:00 PM · Assistant test`,
  });
  await expect(block).toBeVisible();
  await block.click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(block).toBeHidden();
});

async function askAssistant(page: Page, message: string, reply: object) {
  await page.unroute(ASSISTANT_URL);
  await page.route(ASSISTANT_URL, (route) => route.fulfill({ json: reply }));
  await page.getByLabel("Ask the booking assistant").fill(message);
  await page.getByRole("button", { name: "Ask" }).click();
}

test("a suggested change and cancellation are confirmed, then saved", async ({
  page,
}) => {
  const created = await page.request.post("/api/bookings", {
    data: {
      ...AFTERNOON,
      booker_name: BOOKER,
      starts_at: `${STUDIO_DATE}T16:00`,
      ends_at: `${STUDIO_DATE}T18:00`,
    },
  });
  const booking = await created.json();
  await page.goto("/");
  await page.getByLabel("Your name").fill(BOOKER);

  await askAssistant(page, "Make my Camera C booking end at 7", {
    kind: "change",
    message: "Here's your booking ending at 7:00 PM.",
    booking_id: booking.id,
    original: AFTERNOON,
    draft: { ...AFTERNOON, ends_at: atStudioHour(19) },
    options: [],
  });
  const dialog = page.getByRole("dialog", { name: `Booking by ${BOOKER}` });
  await expect(
    dialog.getByRole("region", { name: "Suggested changes" }),
  ).toContainText("4:00 PM – 7:00 PM");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  const block = page.getByRole("button", {
    name: `${BOOKER} · 4:00 PM–7:00 PM · Assistant test`,
  });
  await expect(block).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await expect(
    page.getByRole("button", { name: "Review the change" }),
  ).toBeHidden();

  await askAssistant(page, "Cancel it", {
    kind: "cancel",
    message: "Cancel your Camera C booking?",
    booking_id: booking.id,
    original: { ...AFTERNOON, ends_at: atStudioHour(19) },
    draft: null,
    options: [],
  });
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(dialog).toBeHidden();
  await expect(block).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Booking cancelled.");
});
