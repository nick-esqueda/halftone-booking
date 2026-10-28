import { describe, expect, it } from "vitest";

import { describeChanges } from "./suggestedChanges";

const CONTEXT = {
  namesById: new Map([
    [1, "Camera A"],
    [4, "Lighting Kit 1"],
  ]),
  timezone: "America/Chicago",
};
const BEFORE = {
  equipment_ids: [1],
  starts_at: "2026-10-29T18:00:00Z",
  ends_at: "2026-10-29T20:00:00Z",
  purpose: "",
};

describe("describeChanges", () => {
  it("lists only the fields that change, in studio time", () => {
    const after = {
      ...BEFORE,
      ends_at: "2026-10-29T23:00:00Z",
      purpose: "Shoot",
    };

    expect(describeChanges(BEFORE, after, CONTEXT)).toEqual([
      {
        label: "When",
        before: "Thu 29 Oct, 1:00 PM – 3:00 PM",
        after: "Thu 29 Oct, 1:00 PM – 6:00 PM",
      },
      { label: "Purpose", before: "(none)", after: "Shoot" },
    ]);
  });

  it("compares items by name, whatever their order", () => {
    const reordered = { ...BEFORE, equipment_ids: [4, 1] };
    const swapped = { ...BEFORE, equipment_ids: [1, 4] };

    expect(describeChanges(reordered, swapped, CONTEXT)).toEqual([]);
    expect(describeChanges(BEFORE, swapped, CONTEXT)).toEqual([
      { label: "Items", before: "Camera A", after: "Camera A, Lighting Kit 1" },
    ]);
  });

  it("names unknown items by id", () => {
    const after = { ...BEFORE, equipment_ids: [9] };

    expect(describeChanges(BEFORE, after, CONTEXT)[0].after).toBe("Item 9");
  });
});
