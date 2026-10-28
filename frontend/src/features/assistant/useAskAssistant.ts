import { useMutation } from "@tanstack/react-query";

import { apiClient, unwrapResponse } from "../../api/client";
import type { AssistantReply, AssistantRequest } from "../../api/types";

/** Ask the booking assistant for a draft. It never saves anything. */
export function useAskAssistant() {
  return useMutation<AssistantReply, Error, AssistantRequest>({
    mutationFn: (request) =>
      unwrapResponse(apiClient.POST("/api/assistant/draft", { body: request })),
  });
}
