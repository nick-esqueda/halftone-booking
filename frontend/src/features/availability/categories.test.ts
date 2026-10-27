import { describe, expect, it } from "vitest";

import { getFilterLabel, isInCategory } from "./categories";

describe("isInCategory", () => {
  it("matches everything for the All filter", () => {
    expect(isInCategory("camera", "all")).toBe(true);
  });

  it("matches only the chosen category otherwise", () => {
    expect(isInCategory("camera", "lighting")).toBe(false);
    expect(isInCategory("lighting", "lighting")).toBe(true);
  });
});

describe("getFilterLabel", () => {
  it("labels the All filter", () => {
    expect(getFilterLabel("all")).toBe("All");
  });
});
