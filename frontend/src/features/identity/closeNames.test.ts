import { describe, expect, it } from "vitest";

import { countEdits, findCloseName } from "./closeNames";

const KNOWN = ["Ana Lopez", "Ben", "Sam K"];

describe("countEdits", () => {
  it("counts inserts, deletes and swaps", () => {
    expect(countEdits("samk", "samk")).toBe(0);
    expect(countEdits("samkk", "samk")).toBe(1);
    expect(countEdits("sabk", "samk")).toBe(1);
    expect(countEdits("kitten", "sitting")).toBe(3);
  });
});

describe("findCloseName", () => {
  it("suggests a known name one or two letters off", () => {
    expect(findCloseName("Sam Kk", KNOWN)).toBe("Sam K");
    expect(findCloseName("Ana Lopes", KNOWN)).toBe("Ana Lopez");
  });

  it("ignores spacing, punctuation and case", () => {
    expect(findCloseName("samk.", KNOWN)).toBe("Sam K");
  });

  it("stays quiet for a known name in any case", () => {
    expect(findCloseName("  sam k ", KNOWN)).toBeNull();
  });

  it("stays quiet for a new name unlike the others", () => {
    expect(findCloseName("Priya Shah", KNOWN)).toBeNull();
    expect(findCloseName("", KNOWN)).toBeNull();
  });

  it("allows only one edit on short names", () => {
    expect(findCloseName("Bem", KNOWN)).toBe("Ben");
    expect(findCloseName("Bob", KNOWN)).toBeNull();
  });
});
