import { useCallback, useState } from "react";

import { THEME_STORAGE_KEY } from "../../config/constants";

export type Theme = "light" | "dark";

const DEFAULT_THEME: Theme = "dark";
const DARK_CLASS_NAME = "dark";

function readStoredTheme(): Theme {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "light" ? "light" : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_CLASS_NAME, theme === "dark");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this visit.
  }
}

/** Light or dark mode, remembered per browser. index.html applies it before first paint. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  const toggleTheme = useCallback(() => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }, [theme]);

  return [theme, toggleTheme];
}
