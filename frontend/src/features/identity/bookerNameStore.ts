import { createContext, useContext } from "react";

export interface BookerNameValue {
  bookerName: string;
  setBookerName: (name: string) => void;
}

/** Holds the "Booking as" name. Provided by BookerNameProvider. */
export const BookerNameContext = createContext<BookerNameValue | null>(null);

export function useBookerNameContext(): BookerNameValue {
  const value = useContext(BookerNameContext);
  if (value === null) {
    throw new Error(
      "useBookerNameContext must be used inside BookerNameProvider",
    );
  }
  return value;
}
