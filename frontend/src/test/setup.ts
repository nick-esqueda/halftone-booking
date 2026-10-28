import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { fakeFetch } from "./fakeApi";

// Component tests never reach a real server; see fakeApi.ts.
vi.stubGlobal("fetch", fakeFetch);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
