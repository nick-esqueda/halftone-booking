import { createContext, useContext } from "react";

import type { SessionUser } from "./sessionStore";

export interface SessionValue {
  user: SessionUser | null;
  logIn: (user: SessionUser) => void;
  logOut: () => void;
}

/** Holds who is logged in. Provided by SessionProvider. */
export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return value;
}

/** The logged-in user, for pages behind RequireSession. */
export function useCurrentUser(): SessionUser {
  const { user } = useSession();
  if (user === null) {
    throw new Error("useCurrentUser must be used behind RequireSession");
  }
  return user;
}
