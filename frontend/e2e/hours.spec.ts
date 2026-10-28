/**
 * Which hours the schedule shows: studio hours by default, all 24 on
 * request, with a hint when bookings are hidden. Bookings are made through
 * the API next Thursday and cancelled again, so the test can run again.
 */
import { TZDate } from "@date-fns/tz";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { addDays, format, startOfWeek } from "date-fns";

const STUDIO_TIMEZONE = "America/Chicago";
const BOOKER = "E2E Early Bird";
const CAMERA_C_ID = 3;
const MONDAY = 1;
const THURSDAY_OFFSET_DAYS = 3;
const DAYS_PER_WEEK = 7;

const thisMonday = startOfWeek(TZDate.tz(STUDIO_TIMEZONE), {
  weekStartsOn: MONDAY,
});
const NEXT_THURSDAY = format(
  addDays(thisMonday, DAYS_PER_WEEK + THURSDAY_OFFSET_DAYS),
  "yyyy-MM-dd",
);

interface ListedBooking {
  id: number;
  version: number;
  is_cancelled: boolean;
}

async function cancelBookings(request: APIRequestContext) {
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

test.beforeEach(async ({ request }) => {
  await cancelBookings(request);
});

test.afterEach(async ({ request }) => {
  await cancelBookings(request);
});

test("an early booking is hinted at, then shown with all hours", async ({
  page,
}) => {
  const created = await page.request.post("/api/bookings", {
    data: {
      booker_name: BOOKER,
      equipment_ids: [CAMERA_C_ID],
      starts_at: `${NEXT_THURSDAY}T05:00`,
      ends_at: `${NEXT_THURSDAY}T06:00`,
      purpose: "Sunrise shoot",
    },
  });
  expect(created.ok()).toBe(true);
  await page.goto("/");
  await page.getByRole("button", { name: "Next week" }).click();
  await page.getByRole("tab", { name: /Thu/ }).click();

  const block = page.getByRole("button", { name: /Sunrise shoot/ });
  await expect(block).toBeHidden();
  await page.getByRole("button", { name: "Show all hours" }).click();
  await expect(block).toBeVisible();
  await expect(block).toContainText("5:00 AM–6:00 AM");

  // The choice is remembered in this browser.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "All day", pressed: true }),
  ).toBeVisible();
});
