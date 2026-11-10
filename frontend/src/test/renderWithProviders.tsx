import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { ROUTER_FUTURE_FLAGS, SESSION_STORAGE_KEY } from "../config/constants";
import { SessionProvider } from "../features/session/SessionProvider";
import type { SessionUser } from "../features/session/sessionStore";

/** Who component tests are logged in as, unless a test says otherwise. */
export const TEST_USER: SessionUser = { userId: 1, username: "Sam K" };

/** What `GET /api/users` returns in component tests. */
export const TEST_USERS = [
  { id: TEST_USER.userId, username: TEST_USER.username },
  { id: 2, username: "Ana" },
  { id: 3, username: "Ben" },
];

interface RenderOptions {
  /** Who is logged in; null renders logged out. */
  user?: SessionUser | null;
  /** The URL the router starts at. */
  initialPath?: string;
}

/** Remember `user` as logged in, as the app does after Log in. */
export function rememberSession(user: SessionUser) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

/** Renders a component with the providers the app wraps it in (see main.tsx). */
export function renderWithProviders(
  element: ReactElement,
  { user = TEST_USER, initialPath = "/" }: RenderOptions = {},
) {
  if (user !== null) {
    rememberSession(user);
  }
  // No retries, so a failing request shows its error straight away.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={ROUTER_FUTURE_FLAGS} initialEntries={[initialPath]}>
        <SessionProvider>{children}</SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(element, { wrapper }), queryClient };
}
