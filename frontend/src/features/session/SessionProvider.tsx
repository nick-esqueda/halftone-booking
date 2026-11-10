import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { ApiError, apiClient, unwrapResponse } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import type { User } from "../../api/types";
import { SessionContext } from "./sessionContext";
import {
  LocalSessionStore,
  type SessionStore,
  type SessionUser,
} from "./sessionStore";

const NOT_FOUND_CODE = "not_found";

interface SessionProviderProps {
  children: ReactNode;
  /** Defaults to browser storage; tests and Phase 3 can pass another store. */
  store?: SessionStore;
}

/**
 * Knows who is logged in. Logging in or out empties the query cache, so the
 * next person never sees data loaded for the last one.
 */
export function SessionProvider({ children, store }: SessionProviderProps) {
  const [sessionStore] = useState(() => store ?? new LocalSessionStore());
  const [user, setUser] = useState(() => sessionStore.read());
  const queryClient = useQueryClient();

  const switchUser = useCallback(
    (nextUser: SessionUser | null) => {
      queryClient.clear();
      setUser(nextUser);
    },
    [queryClient],
  );

  const logIn = useCallback(
    (nextUser: SessionUser) => {
      sessionStore.save(nextUser);
      switchUser(nextUser);
    },
    [sessionStore, switchUser],
  );

  const logOut = useCallback(() => {
    sessionStore.clear();
    switchUser(null);
  }, [sessionStore, switchUser]);

  // Another tab logged in or out: follow it.
  useEffect(
    () => sessionStore.subscribe(() => switchUser(sessionStore.read())),
    [sessionStore, switchUser],
  );

  useLogOutWhenUserIsGone(user, logOut);

  return (
    <SessionContext.Provider value={{ user, logIn, logOut }}>
      {children}
    </SessionContext.Provider>
  );
}

/** A remembered user can vanish, e.g. after a database reset. */
function useLogOutWhenUserIsGone(user: SessionUser | null, logOut: () => void) {
  const userId = user?.userId ?? 0;
  const userQuery = useQuery<User>({
    queryKey: queryKeys.user(userId),
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/users/{user_id}", {
          params: { path: { user_id: userId } },
        }),
      ),
    enabled: user !== null,
    retry: false,
  });

  const error = userQuery.error;
  const isUserGone = error instanceof ApiError && error.code === NOT_FOUND_CODE;
  useEffect(() => {
    if (isUserGone) {
      logOut();
    }
  }, [isUserGone, logOut]);
}
