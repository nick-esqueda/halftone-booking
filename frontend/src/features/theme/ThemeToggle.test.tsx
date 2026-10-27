import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY } from "../../config/constants";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("ThemeToggle", () => {
  it("starts in dark mode", () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });

  it("switches to light mode and remembers it", async () => {
    document.documentElement.classList.add("dark");
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button"));

    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });

  it("starts in light mode when that was chosen before", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });
});
