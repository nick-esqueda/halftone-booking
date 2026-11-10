import { useQuery } from "@tanstack/react-query";

import { apiClient, unwrapResponse } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import type { User } from "../../api/types";

/** Everyone a booking can be made for, sorted by username. */
export function useUsers() {
  return useQuery<User[]>({
    queryKey: queryKeys.users,
    queryFn: () => unwrapResponse(apiClient.GET("/api/users")),
  });
}
