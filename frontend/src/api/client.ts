import createClient from "openapi-fetch";

import type { paths } from "./schema";
import type { ApiErrorBody, Conflict } from "./types";

// Empty means "same origin": Vite's dev server proxies /api to the backend.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL });

const UNKNOWN_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** An error returned by the API, in its shared `{code, message, conflicts}` shape. */
export class ApiError extends Error {
  readonly code: string;
  readonly conflicts: Conflict[];

  constructor(body: Partial<ApiErrorBody> | undefined) {
    super(body?.message ?? UNKNOWN_ERROR_MESSAGE);
    this.code = body?.code ?? "unknown";
    this.conflicts = body?.conflicts ?? [];
  }
}

interface FetchResult<T> {
  data?: T;
  error?: unknown;
}

/** Return the response data, or throw an ApiError when the request failed. */
export async function unwrapResponse<T>(
  request: Promise<FetchResult<T>>,
): Promise<T> {
  const { data, error } = await request;
  if (error !== undefined || data === undefined) {
    throw new ApiError(error as Partial<ApiErrorBody> | undefined);
  }
  return data;
}
