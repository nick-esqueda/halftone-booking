import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import { APP_ROUTES } from "../test/appRoutes";
import { installFakeApi, respond } from "../test/fakeApi";
import { renderWithProviders } from "../test/renderWithProviders";

const SUSIE = { id: 4, username: "Susie" };
const USER_NOT_FOUND = {
  code: "user_not_found",
  message: "No user has that username.",
  conflicts: [],
};
const UNAVAILABLE = {
  code: "service_unavailable",
  message: "Booking is temporarily unavailable. Please try again in a minute.",
  conflicts: [],
};

function renderLoggedOut(path = "/login") {
  return renderWithProviders(<App />, { user: null, initialPath: path });
}

async function logInAs(username: string) {
  await userEvent.type(screen.getByLabelText("Username"), username);
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginPage", () => {
  it("shows only the app name, the username field, Log in and the theme toggle", () => {
    installFakeApi({});
    renderLoggedOut();

    expect(
      screen.getByRole("heading", { name: "Halftone Booking" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Switch to (light|dark) mode/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Booking as|Signed in as/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Ask the booking assistant"),
    ).not.toBeInTheDocument();
  });

  it("sends no request while showing or typing", async () => {
    const api = installFakeApi({});
    renderLoggedOut();

    await userEvent.type(screen.getByLabelText("Username"), "Susie");

    expect(api.allRoutes()).toEqual([]);
  });

  it("doesn't suggest usernames", () => {
    installFakeApi({});
    const { container } = renderLoggedOut();

    expect(screen.getByLabelText("Username")).not.toHaveAttribute("list");
    expect(container.querySelector("datalist")).toBeNull();
  });

  it("asks for a name before sending anything", async () => {
    const api = installFakeApi({});
    renderLoggedOut();

    await userEvent.type(screen.getByLabelText("Username"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter your name to continue.",
    );
    expect(api.allRoutes()).toEqual([]);
  });

  it("logs in a listed user with Enter and shows the schedule", async () => {
    const api = installFakeApi({
      ...APP_ROUTES,
      "POST /api/login": () => respond(200, SUSIE),
      "GET /api/users/4": () => respond(200, SUSIE),
    });
    renderLoggedOut();

    await userEvent.type(screen.getByLabelText("Username"), "  susie {Enter}");

    expect(await screen.findByText("Signed in as")).toBeInTheDocument();
    expect(screen.getByText("Susie")).toBeInTheDocument();
    expect(api.requests("POST /api/login")).toEqual([{ username: "susie" }]);
  });

  it("refuses a name that isn't a user, keeps it, and offers no way to create it", async () => {
    installFakeApi({ "POST /api/login": () => respond(404, USER_NOT_FOUND) });
    renderLoggedOut();

    await logInAs("Nobody Here");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No user named Nobody Here. Check the spelling.",
    );
    expect(screen.getByLabelText("Username")).toHaveValue("Nobody Here");
    expect(
      screen.queryByRole("button", { name: /create/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the usual friendly error when the server is down", async () => {
    installFakeApi({ "POST /api/login": () => respond(503, UNAVAILABLE) });
    renderLoggedOut();

    await logInAs("Susie");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("has a working theme toggle", async () => {
    installFakeApi({});
    renderLoggedOut();

    await userEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );

    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
