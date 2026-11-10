import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import type { AssistantReply, Booking } from "./api/types";
import { SESSION_STORAGE_KEY } from "./config/constants";
import { APP_ROUTES } from "./test/appRoutes";
import { installFakeApi, respond } from "./test/fakeApi";
import { TEST_USERS, renderWithProviders } from "./test/renderWithProviders";

const BEN = TEST_USERS[2];

const SAMS_BOOKING = {
  id: 7,
  booker_name: "Sam K",
  purpose: "Sam's interview",
  starts_at: "2099-10-29T10:30:00-05:00",
  ends_at: "2099-10-29T12:30:00-05:00",
  is_cancelled: false,
  version: 1,
  items: [{ equipment_id: 1, equipment_name: "Camera A" }],
} as Booking;

const MESSAGE_REPLY: AssistantReply = {
  kind: "message",
  message: "What time on Thursday?",
  draft: null,
  options: [],
};

/** Stands in for the browser's Back button. */
function BackButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Back</button>;
}

async function logOut() {
  await userEvent.click(await screen.findByRole("button", { name: "Log out" }));
}

async function logInAs(username: string) {
  await userEvent.type(await screen.findByLabelText("Username"), username);
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("the app header", () => {
  it("shows who is signed in and a Log out button, with no name field", async () => {
    installFakeApi({ ...APP_ROUTES });
    renderWithProviders(<App />);

    const header = await screen.findByRole("banner");
    expect(header).toHaveTextContent("Signed in as");
    expect(within(header).getByText("Sam K")).toBeInTheDocument();
    expect(
      within(header).getByRole("button", { name: "Log out" }),
    ).toBeInTheDocument();
    expect(within(header).queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("logging out", () => {
  it("forgets the user and cached data, and shows an empty login page", async () => {
    installFakeApi({ ...APP_ROUTES });
    const { queryClient } = renderWithProviders(<App />);
    await screen.findByTestId("row-1");

    await logOut();

    expect(screen.getByLabelText("Username")).toHaveValue("");
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    const cachedData = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.data !== undefined);
    expect(cachedData).toEqual([]);
  });

  it("doesn't let Back return to the schedule", async () => {
    installFakeApi({ ...APP_ROUTES });
    renderWithProviders(
      <>
        <BackButton />
        <App />
      </>,
      { initialPath: "/my-bookings" },
    );
    await userEvent.click(
      await screen.findByRole("link", { name: "Schedule" }),
    );
    await logOut();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.queryByTestId("row-1")).not.toBeInTheDocument();
  });

  it("shows the next user only their own bookings", async () => {
    const askedNames: (string | null)[] = [];
    installFakeApi({
      ...APP_ROUTES,
      "GET /api/bookings": (_body, url) => {
        const name = url.searchParams.get("booker_name");
        askedNames.push(name);
        return respond(200, name === "Sam K" ? [SAMS_BOOKING] : []);
      },
      "POST /api/login": () => respond(200, BEN),
    });
    renderWithProviders(<App />, { initialPath: "/my-bookings" });
    expect(await screen.findByText("Sam's interview")).toBeInTheDocument();

    await logOut();
    await logInAs("Ben");
    await userEvent.click(
      await screen.findByRole("link", { name: "My bookings" }),
    );

    expect(
      (await screen.findAllByText("Nothing here.")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Sam's interview")).not.toBeInTheDocument();
    expect(askedNames).toEqual(["Sam K", "Ben"]);
  });

  it("starts the next user with an empty assistant chat", async () => {
    installFakeApi({
      ...APP_ROUTES,
      "GET /api/config": () =>
        respond(200, {
          timezone: "America/Chicago",
          time_step_minutes: 15,
          assistant_enabled: true,
        }),
      "POST /api/assistant/draft": () => respond(200, MESSAGE_REPLY),
      "POST /api/login": () => respond(200, BEN),
    });
    renderWithProviders(<App />);
    await userEvent.type(
      await screen.findByLabelText("Ask the booking assistant"),
      "Camera A Thursday",
    );
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText(MESSAGE_REPLY.message);

    await logOut();
    await logInAs("Ben");

    await screen.findByLabelText("Ask the booking assistant");
    expect(screen.queryByText(MESSAGE_REPLY.message)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Conversation" }),
    ).not.toBeInTheDocument();
  });
});
