import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCurrentTime } from "./useCurrentTime";

const ONE_MINUTE_MS = 60_000;

describe("useCurrentTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves forward on each refresh", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T15:30:00Z"));
    const { result } = renderHook(() => useCurrentTime(ONE_MINUTE_MS));

    act(() => {
      vi.advanceTimersByTime(ONE_MINUTE_MS);
    });

    expect(result.current.toISOString()).toBe("2026-10-29T15:31:00.000Z");
  });
});
