import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Booking } from "../api/types";
import { NAME_STORAGE_KEY } from "../config/constants";
import { installFakeApi, respond } from "../test/fakeApi";
import { renderWithProviders } from "../test/renderWithProviders";
import { MyBookingsPage } from "./MyBookingsPage";

const CONFIG = { timezone: "America/Chicago", time_step_minutes: 15 };

// Far enough ahead to always be upcoming.
const UPCOMING_BOOKING = {
  id: 7,
  booker_name: "Sam K",
  purpose: "Interview",
  starts_at: "2099-10-29T10:30:00-05:00",
  ends_at: "2099-10-29T12:30:00-05:00",
  is_cancelled: false,
  version: 1,
  items: [
    { equipment_id: 1, equipment_name: "Camera A" },
    { equipment_id: 2, equipment_name: "Camera B" },
  ],
} as Booking;

describe("MyBookingsPage", () => {
  it("names each column of the bookings table", async () => {
    window.localStorage.setItem(NAME_STORAGE_KEY, "Sam K");
    installFakeApi({
      "GET /api/config": () => respond(200, CONFIG),
      "GET /api/bookings": () => respond(200, [UPCOMING_BOOKING]),
    });
    renderWithProviders(<MyBookingsPage />);

    const upcoming = (await screen.findAllByRole("table"))[0];
    const headers = within(upcoming).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Date",
      "Time",
      "Equipment",
      "Purpose",
      "Actions",
    ]);
    const row = within(upcoming).getByRole("row", { name: /Interview/ });
    expect(row).toHaveTextContent("10:30 AM – 12:30 PM");
    expect(row).toHaveTextContent("Camera A, Camera B");
  });
});

describe("cancelling from My bookings", () => {
  it("asks in a dialog that names the booking, then cancels it", async () => {
    window.localStorage.setItem(NAME_STORAGE_KEY, "Sam K");
    const api = installFakeApi({
      "GET /api/config": () => respond(200, CONFIG),
      "GET /api/bookings": () => respond(200, [UPCOMING_BOOKING]),
      "POST /api/bookings/7/cancel": () =>
        respond(200, { ...UPCOMING_BOOKING, is_cancelled: true, version: 2 }),
    });
    renderWithProviders(<MyBookingsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Cancel this booking?",
    });
    expect(dialog).toHaveTextContent("Camera A, Camera B");
    expect(dialog).toHaveTextContent("10:30 AM – 12:30 PM");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel booking" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(api.requests("POST /api/bookings/7/cancel")).toEqual([
      expect.objectContaining({ actor_name: "Sam K", version: 1 }),
    ]);
  });

  it("keeps the booking when the person changes their mind", async () => {
    window.localStorage.setItem(NAME_STORAGE_KEY, "Sam K");
    const api = installFakeApi({
      "GET /api/config": () => respond(200, CONFIG),
      "GET /api/bookings": () => respond(200, [UPCOMING_BOOKING]),
    });
    renderWithProviders(<MyBookingsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.requests("POST /api/bookings/7/cancel")).toEqual([]);
  });
});

describe("MyBookingsPage when the API is failing", () => {
  it("shows an error with a way to try again", async () => {
    window.localStorage.setItem(NAME_STORAGE_KEY, "Sam K");
    installFakeApi({
      "GET /api/config": () => respond(200, CONFIG),
      "GET /api/bookings": () =>
        respond(500, {
          code: "internal_error",
          message: "Something went wrong on our side. Please try again.",
          conflicts: [],
        }),
    });
    renderWithProviders(<MyBookingsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load your bookings.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});
