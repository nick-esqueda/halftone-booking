import { describe, expect, it } from "vitest";

import { USERNAME_MAX_LENGTH } from "../../config/constants";
import { findUsernameProblem, normalizeUsername } from "./username";

describe("normalizeUsername", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeUsername("  Sam   K ")).toBe("Sam K");
  });

  it("keeps capitals and accents", () => {
    expect(normalizeUsername("Lena Müller")).toBe("Lena Müller");
  });
});

describe("findUsernameProblem", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(findUsernameProblem("")).toBe("Enter your name to continue.");
    expect(findUsernameProblem("   ")).toBe("Enter your name to continue.");
  });

  it("allows exactly the limit and rejects one more", () => {
    const atLimit = "x".repeat(USERNAME_MAX_LENGTH);
    expect(findUsernameProblem(atLimit)).toBeNull();
    expect(findUsernameProblem(`${atLimit}x`)).toMatch(/at most 80/);
  });
});
