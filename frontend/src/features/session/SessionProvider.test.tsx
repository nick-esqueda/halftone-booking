import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../../App";
import { SESSION_STORAGE_KEY } from "../../config/constants";
import { APP_ROUTES } from "../../test/appRoutes";
import { installFakeApi, respond } from "../../test/fakeApi";
import { renderWithProviders } from "../../test/renderWithProviders";

const USER_GONE = {
  code: "not_found",
  message: "User 99 doesn't exist.",
  conflicts: [],
};

/** What another tab does to storage, as this tab sees it. */
function changeSessionInAnotherTab(nextValue: string | null) {
  if (nextValue === null) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    window.localStorage.setItem(SESSION_STORAGE_KEY, nextValue);
  }
  const event = new StorageEvent("storage", {
    key: SESSION_STORAGE_KEY,
    newValue: nextValue,
  });
  act(() => {
    window.dispatchEvent(event);
  });
}

describe("SessionProvider", () => {
  it("logs out a remembered user who no longer exists", async () => {
    installFakeApi({
      ...APP_ROUTES,
      "GET /api/users/99": () => respond(404, USER_GONE),
    });
    renderWithProviders(<App />, { user: { userId: 99, username: "Gone" } });

    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("logs out when another tab logs out", async () => {
    installFakeApi({ ...APP_ROUTES });
    renderWithProviders(<App />);
    await screen.findByText("Signed in as");

    changeSessionInAnotherTab(null);

    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
  });

  it("follows another tab that logs in as someone else", async () => {
    installFakeApi({ ...APP_ROUTES });
    renderWithProviders(<App />);
    await screen.findByText("Sam K");

    changeSessionInAnotherTab(JSON.stringify({ userId: 3, username: "Ben" }));

    expect(await screen.findByText("Ben")).toBeInTheDocument();
    expect(screen.queryByText("Sam K")).not.toBeInTheDocument();
  });
});
