import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "../../App";
import { APP_ROUTES } from "../../test/appRoutes";
import { installFakeApi, respond } from "../../test/fakeApi";
import {
  TEST_USERS,
  renderWithProviders,
} from "../../test/renderWithProviders";

describe("RequireSession", () => {
  it.each(["/", "/my-bookings"])(
    "sends a logged-out visit to %s to the login page",
    (path) => {
      installFakeApi({});
      renderWithProviders(<App />, { user: null, initialPath: path });

      expect(screen.getByLabelText("Username")).toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    },
  );

  it("returns to the page first asked for after logging in", async () => {
    installFakeApi({
      ...APP_ROUTES,
      "POST /api/login": () => respond(200, TEST_USERS[0]),
    });
    renderWithProviders(<App />, { user: null, initialPath: "/my-bookings" });

    await userEvent.type(screen.getByLabelText("Username"), "Sam K");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByRole("heading", { name: "Upcoming" }),
    ).toBeInTheDocument();
  });

  it.each(["/login", "/no-such-page"])(
    "sends a logged-in visit to %s to the schedule",
    async (path) => {
      installFakeApi({ ...APP_ROUTES });
      renderWithProviders(<App />, { initialPath: path });

      expect(await screen.findByTestId("row-1")).toBeInTheDocument();
      expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    },
  );
});
