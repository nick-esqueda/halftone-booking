import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AssistantReply, Booking } from "../../api/types";
import { installFakeApi, respond } from "../../test/fakeApi";
import { renderWithProviders } from "../../test/renderWithProviders";
import { readTime } from "../../test/timePicker";
import { SchedulePage } from "../../pages/SchedulePage";

const CAMERA_A = {
  id: 1,
  name: "Camera A",
  category: "camera",
  description: "",
};
const LIGHT_1 = {
  id: 4,
  name: "Lighting Kit 1",
  category: "lighting",
  description: "",
};
const CONFIG = {
  timezone: "America/Chicago",
  time_step_minutes: 15,
  assistant_enabled: true,
};
const AVAILABILITY = {
  equipment: [
    { equipment: CAMERA_A, is_free: true, busy: [] },
    { equipment: LIGHT_1, is_free: true, busy: [] },
  ],
};
const BOOKING = {
  id: 7,
  booker_name: "Sam K",
  purpose: "Interview",
  starts_at: "2026-10-29T13:00:00-05:00",
  ends_at: "2026-10-29T15:00:00-05:00",
  is_cancelled: false,
  version: 3,
  items: [{ equipment_id: CAMERA_A.id, equipment_name: "Camera A" }],
} as Booking;
const ORIGINAL = {
  equipment_ids: [CAMERA_A.id],
  starts_at: BOOKING.starts_at,
  ends_at: BOOKING.ends_at,
  purpose: "Interview",
};

const CHANGE_REPLY: AssistantReply = {
  kind: "change",
  message: "Here's your Camera A booking ending at 6:00 PM, with a light.",
  booking_id: BOOKING.id,
  original: ORIGINAL,
  draft: {
    ...ORIGINAL,
    equipment_ids: [CAMERA_A.id, LIGHT_1.id],
    ends_at: "2026-10-29T18:00:00-05:00",
  },
  options: [],
};
const CANCEL_REPLY: AssistantReply = {
  kind: "cancel",
  message: "Cancel your Camera A booking on Thursday?",
  booking_id: BOOKING.id,
  original: ORIGINAL,
  draft: null,
  options: [],
};

function installApi(assistantReply: AssistantReply) {
  return installFakeApi({
    "GET /api/config": () => respond(200, CONFIG),
    "GET /api/availability": () => respond(200, AVAILABILITY),
    "GET /api/booker-names": () => respond(200, []),
    "GET /api/equipment": () => respond(200, [CAMERA_A, LIGHT_1]),
    "GET /api/bookings/7": () => respond(200, BOOKING),
    "GET /api/bookings/7/history": () => respond(200, []),
    "PUT /api/bookings/7": () => respond(200, { ...BOOKING, version: 4 }),
    "POST /api/bookings/7/cancel": () =>
      respond(200, { ...BOOKING, is_cancelled: true, version: 4 }),
    "POST /api/assistant/draft": () => respond(200, assistantReply),
  });
}

async function ask(message: string) {
  const input = await screen.findByLabelText("Ask the booking assistant");
  await userEvent.type(input, message);
  await userEvent.click(screen.getByRole("button", { name: "Ask" }));
}

describe("assistant suggestions for existing bookings", () => {
  it("opens the booking with the change filled in and a before → after summary", async () => {
    installApi(CHANGE_REPLY);
    renderWithProviders(<SchedulePage />);

    await ask("Make my Camera A booking end at 6 and add a light");

    const dialog = await screen.findByRole("dialog", {
      name: "Booking by Sam K",
    });
    const summary = await within(dialog).findByRole("region", {
      name: "Suggested changes",
    });
    expect(summary).toHaveTextContent(
      "When" +
        "Thu 29 Oct, 1:00 PM – 3:00 PM" +
        " → " +
        "Thu 29 Oct, 1:00 PM – 6:00 PM",
    );
    await waitFor(() =>
      expect(summary).toHaveTextContent(
        "Items" + "Camera A" + " → " + "Camera A, Lighting Kit 1",
      ),
    );
    expect(summary).not.toHaveTextContent("Purpose");
    expect(readTime("End time")).toBe("6:00 PM");
    expect(
      within(dialog).getByRole("checkbox", { name: /Lighting Kit 1/ }),
    ).toBeChecked();
  });

  it("saves the change only when the person presses Save changes", async () => {
    const api = installApi(CHANGE_REPLY);
    renderWithProviders(<SchedulePage />);

    await ask("Make it end at 6 with a light");
    const dialog = await screen.findByRole("dialog", {
      name: "Booking by Sam K",
    });
    expect(api.requests("PUT /api/bookings/7")).toEqual([]);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(api.requests("PUT /api/bookings/7")).toEqual([
        {
          booker_name: "Sam K",
          purpose: "Interview",
          equipment_ids: [CAMERA_A.id, LIGHT_1.id],
          starts_at: "2026-10-29T13:00",
          ends_at: "2026-10-29T18:00",
          version: 3,
        },
      ]),
    );
  });

  it("opens the booking asking to confirm a suggested cancellation", async () => {
    const api = installApi(CANCEL_REPLY);
    renderWithProviders(<SchedulePage />);

    await ask("Cancel my Thursday booking");

    const dialog = await screen.findByRole("dialog", {
      name: "Booking by Sam K",
    });
    expect(
      within(dialog).getByRole("region", { name: "Suggested cancellation" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Cancel this booking?"),
    ).toBeInTheDocument();
    expect(api.requests("POST /api/bookings/7/cancel")).toEqual([]);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel booking" }),
    );

    await waitFor(() =>
      expect(api.requests("POST /api/bookings/7/cancel")).toEqual([
        { actor_name: "Sam K", version: 3 },
      ]),
    );
  });

  it("can reopen the suggestion from the conversation", async () => {
    installApi(CANCEL_REPLY);
    renderWithProviders(<SchedulePage />);

    await ask("Cancel my Thursday booking");
    await userEvent.click(
      await within(
        await screen.findByRole("dialog", { name: "Booking by Sam K" }),
      ).findByRole("button", { name: "Keep it" }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      await screen.findByRole("button", { name: "Review the cancellation" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Booking by Sam K" }),
    ).toBeInTheDocument();
  });
});
