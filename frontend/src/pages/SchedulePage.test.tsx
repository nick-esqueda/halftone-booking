import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { installFakeApi, respond } from "../test/fakeApi";
import { TEST_USERS, renderWithProviders } from "../test/renderWithProviders";
import { SchedulePage } from "./SchedulePage";

const CONFIG = { timezone: "America/Chicago", time_step_minutes: 15 };
const CAMERA_A = {
  id: 1,
  name: "Camera A",
  category: "camera",
  description: "",
};
const AVAILABILITY = {
  equipment: [{ equipment: CAMERA_A, is_free: true, busy: [] }],
};
const UNAVAILABLE = {
  code: "service_unavailable",
  message: "Booking is temporarily unavailable. Please try again in a minute.",
  conflicts: [],
};

const ANAS_BOOKING = {
  id: 7,
  booker_name: "Ana",
  purpose: "Interview",
  starts_at: "2099-10-29T10:00:00-05:00",
  ends_at: "2099-10-29T12:00:00-05:00",
  is_cancelled: false,
  version: 3,
  items: [{ equipment_id: CAMERA_A.id, equipment_name: "Camera A" }],
};
const BUSY_AVAILABILITY = {
  equipment: [
    {
      equipment: CAMERA_A,
      is_free: false,
      busy: [
        {
          booking_id: ANAS_BOOKING.id,
          booker_name: "Ana",
          purpose: "Interview",
          // Spans today whatever day the test runs.
          starts_at: "2000-01-01T00:00:00-06:00",
          ends_at: ANAS_BOOKING.ends_at,
        },
      ],
    },
  ],
};

describe("someone else's booking on the schedule", () => {
  it("opens with Save changes and Cancel available", async () => {
    installFakeApi({
      "GET /api/config": () => respond(200, CONFIG),
      "GET /api/availability": () => respond(200, BUSY_AVAILABILITY),
      "GET /api/users": () => respond(200, TEST_USERS),
      "GET /api/bookings/7": () => respond(200, ANAS_BOOKING),
      "GET /api/bookings/7/history": () => respond(200, []),
    });
    renderWithProviders(<SchedulePage />);

    await userEvent.click(await screen.findByRole("button", { name: /Ana/ }));

    const dialog = await screen.findByRole("dialog", {
      name: "Booking by Ana",
    });
    expect(
      await within(dialog).findByRole("button", { name: "Save changes" }),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole("button", { name: /^Cancel$/ }),
    ).toBeEnabled();
  });
});

describe("SchedulePage when the API is failing", () => {
  it("shows an error instead of an empty timeline, then recovers", async () => {
    const api = installFakeApi({
      "GET /api/config": () => respond(200, CONFIG),
      "GET /api/availability": () => respond(503, UNAVAILABLE),
    });
    renderWithProviders(<SchedulePage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the schedule.");
    expect(alert).toHaveTextContent("temporarily unavailable");
    expect(screen.queryByTestId("row-1")).not.toBeInTheDocument();

    api.setRoute("GET /api/availability", () => respond(200, AVAILABILITY));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("row-1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("doesn't hang on Loading when the studio settings fail", async () => {
    installFakeApi({ "GET /api/config": () => respond(503, UNAVAILABLE) });
    renderWithProviders(<SchedulePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load the studio settings.",
    );
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});
