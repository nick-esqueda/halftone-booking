import { useEffect, useState } from "react";

/** The current time, refreshed every `refreshMs` so clocks on screen keep moving. */
export function useCurrentTime(refreshMs: number): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), refreshMs);
    return () => window.clearInterval(timerId);
  }, [refreshMs]);

  return now;
}
