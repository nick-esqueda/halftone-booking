import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NAME_STORAGE_KEY } from "../config/constants";
import { installFakeApi, respond } from "../test/fakeApi";
import { renderWithProviders } from "../test/renderWithProviders";
import { MyBookingsPage } from "./MyBookingsPage";

describe("MyBookingsPage when the API is failing", () => {
  it("shows an error with a way to try again", async () => {
    window.localStorage.setItem(NAME_STORAGE_KEY, "Sam K");
    installFakeApi({
      "GET /api/config": () =>
        respond(200, { timezone: "America/Chicago", time_step_minutes: 15 }),
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
