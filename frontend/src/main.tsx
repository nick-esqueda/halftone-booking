import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { ROUTER_FUTURE_FLAGS } from "./config/constants";
import { App } from "./App";
import { BookerNameProvider } from "./features/identity/BookerNameContext";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={ROUTER_FUTURE_FLAGS}>
        <BookerNameProvider>
          <App />
        </BookerNameProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
