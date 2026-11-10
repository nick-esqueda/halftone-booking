import { useMutation } from "@tanstack/react-query";

import { apiClient, unwrapResponse } from "../../api/client";
import { useSession } from "./sessionContext";
import { normalizeUsername } from "./username";

/** Asks the API for the user with this username, then logs them in. */
export function useLogIn() {
  const { logIn } = useSession();
  return useMutation({
    mutationFn: (rawUsername: string) =>
      unwrapResponse(
        apiClient.POST("/api/login", {
          body: { username: normalizeUsername(rawUsername) },
        }),
      ),
    onSuccess: (user) => logIn({ userId: user.id, username: user.username }),
  });
}
