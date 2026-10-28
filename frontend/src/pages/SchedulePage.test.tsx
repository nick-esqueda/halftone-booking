import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { installFakeApi, respond } from "../test/fakeApi";
import { renderWithProviders } from "../test/renderWithProviders";
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
