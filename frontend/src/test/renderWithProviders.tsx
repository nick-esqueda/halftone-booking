import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { ROUTER_FUTURE_FLAGS } from "../config/constants";
import { BookerNameProvider } from "../features/identity/BookerNameContext";

/** Renders a component with the providers the app wraps it in (see main.tsx). */
export function renderWithProviders(element: ReactElement) {
  // No retries, so a failing request shows its error straight away.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={ROUTER_FUTURE_FLAGS}>
        <BookerNameProvider>{children}</BookerNameProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(element, { wrapper });
}
