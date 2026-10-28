/**
 * The booking assistant, from question to saved booking. The assistant's
 * reply is intercepted in the browser (no model runs in CI); booking the
 * draft goes through the real API and database.
 */
import { TZDate } from "@date-fns/tz";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { addDays, format } from "date-fns";

const STUDIO_TIMEZONE = "America/Chicago";
const BOOKER = "E2E Assistant";
const CAMERA_C_ID = 3;
// Far enough ahead that the time is never in the past or on a busy day.
const DAYS_AHEAD = 9;
const CONFIG_URL = "**/api/config";
const ASSISTANT_URL = "**/api/assistant/draft";

function buildDraftReply() {
  const today = TZDate.tz(STUDIO_TIMEZONE);
  const day = addDays(today, DAYS_AHEAD);
  const year = day.getFullYear();
  const month = day.getMonth();
  const date = day.getDate();
  const startsAt = new TZDate(year, month, date, 16, 0, STUDIO_TIMEZONE);
  const endsAt = new TZDate(year, month, date, 18, 0, STUDIO_TIMEZONE);
  return {
    kind: "draft",
    message: "Here's Camera C for that afternoon.",
    draft: {
      equipment_ids: [CAMERA_C_ID],
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      purpose: "Assistant test",
    },
    options: [],
    studioDate: format(day, "yyyy-MM-dd"),
  };
}

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
  const { studioDate, ...reply } = buildDraftReply();
  await page.route(ASSISTANT_URL, (route) => route.fulfill({ json: reply }));
  await page.goto("/");
  await page.getByLabel("Your name").fill(BOOKER);

  await page
    .getByLabel("Ask the booking assistant")
    .fill("Camera C next week at 4 for the assistant test");
  await page.getByRole("button", { name: "Ask" }).click();

  const dialog = page.getByRole("dialog", { name: "New booking" });
  await expect(dialog.getByLabel("Start date")).toHaveValue(studioDate);
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
