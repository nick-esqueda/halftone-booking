import { useQuery } from "@tanstack/react-query";

import { apiClient, unwrapResponse } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import type { Equipment } from "../../api/types";

/** Every bookable item. The list rarely changes, so it's loaded once. */
export function useEquipment() {
  return useQuery<Equipment[]>({
    queryKey: queryKeys.equipment,
    queryFn: () => unwrapResponse(apiClient.GET("/api/equipment")),
    staleTime: Infinity,
  });
}
