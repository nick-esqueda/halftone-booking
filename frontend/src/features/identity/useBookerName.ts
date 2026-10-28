import { useCallback, useState } from "react";

import { NAME_STORAGE_KEY } from "../../config/constants";

// Storage can be unavailable (private windows, blocked site data); the app
// still works, it just won't remember the name.
function readStoredName(): string {
  try {
    return window.localStorage.getItem(NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredName(name: string): void {
  try {
    window.localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Not remembering the name is fine.
  }
}

/** The name this browser books under, until logins exist (Phase 3). */
export function useBookerName(): [string, (name: string) => void] {
  const [bookerName, setBookerNameState] = useState(readStoredName);

  const setBookerName = useCallback((name: string) => {
    writeStoredName(name);
    setBookerNameState(name);
  }, []);

  return [bookerName, setBookerName];
}
