import { useCallback, useState } from "react";

import { HOUR_RANGE_STORAGE_KEY } from "../../config/constants";
import { HOUR_RANGES, type HourRangeName } from "./dayLayout";

const DEFAULT_RANGE_NAME: HourRangeName = "studioHours";

function isHourRangeName(value: string | null): value is HourRangeName {
  return value !== null && value in HOUR_RANGES;
}

// Storage can be unavailable (private windows, blocked site data); the
// schedule then just starts on studio hours each time.
function readStoredRangeName(): HourRangeName {
  try {
    const stored = window.localStorage.getItem(HOUR_RANGE_STORAGE_KEY);
    return isHourRangeName(stored) ? stored : DEFAULT_RANGE_NAME;
  } catch {
    return DEFAULT_RANGE_NAME;
  }
}

function writeStoredRangeName(name: HourRangeName): void {
  try {
    window.localStorage.setItem(HOUR_RANGE_STORAGE_KEY, name);
  } catch {
    // Not remembering the choice is fine.
  }
}

/** Which hours the schedule shows, remembered in this browser. */
export function useHourRange(): [HourRangeName, (name: HourRangeName) => void] {
  const [rangeName, setRangeNameState] = useState(readStoredRangeName);

  const setRangeName = useCallback((name: HourRangeName) => {
    writeStoredRangeName(name);
    setRangeNameState(name);
  }, []);

  return [rangeName, setRangeName];
}
