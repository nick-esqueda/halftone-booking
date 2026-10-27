import { useQuery } from "@tanstack/react-query";

import { apiClient, unwrapResponse } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";

/** Names used on earlier bookings, offered as autocomplete. */
export function useBookerNames() {
  return useQuery<string[]>({
    queryKey: queryKeys.bookerNames,
    queryFn: () => unwrapResponse(apiClient.GET("/api/booker-names")),
  });
}
