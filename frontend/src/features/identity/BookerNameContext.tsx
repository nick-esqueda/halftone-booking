import type { ReactNode } from "react";

import { BookerNameContext } from "./bookerNameStore";
import { useBookerName } from "./useBookerName";

export function BookerNameProvider({ children }: { children: ReactNode }) {
  const [bookerName, setBookerName] = useBookerName();
  return (
    <BookerNameContext.Provider value={{ bookerName, setBookerName }}>
      {children}
    </BookerNameContext.Provider>
  );
}
