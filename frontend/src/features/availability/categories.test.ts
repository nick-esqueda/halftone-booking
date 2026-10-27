import { describe, expect, it } from "vitest";

import { getFilterLabel, groupByCategory, isInCategory } from "./categories";

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

describe("groupByCategory", () => {
  const buildRow = (name: string, category: string) => ({
    equipment: { name, category },
  });

  it("groups items by category in the order categories first appear", () => {
    const rows = [
      buildRow("Camera A", "camera"),
      buildRow("Kit 1", "lighting"),
      buildRow("Camera B", "camera"),
    ];
    const groups = groupByCategory(rows);

    expect(groups.map((group) => group.category)).toEqual([
      "camera",
      "lighting",
    ]);
    expect(groups[0].rows.map((row) => row.equipment.name)).toEqual([
      "Camera A",
      "Camera B",
    ]);
  });

  it("returns no groups for no rows", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
