import { useQuery } from "@tanstack/react-query";

import { apiClient, unwrapResponse } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import type { StudioConfig } from "../../api/types";

export function useStudioConfig() {
  return useQuery<StudioConfig>({
    queryKey: queryKeys.config,
    queryFn: () => unwrapResponse(apiClient.GET("/api/config")),
    staleTime: Infinity,
  });
}
