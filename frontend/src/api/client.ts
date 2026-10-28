import createClient from "openapi-fetch";

import type { paths } from "./schema";
import type { ApiErrorBody, Conflict } from "./types";

// Empty means "same origin": Vite's dev server proxies /api to the backend.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL });

/** Error codes the UI creates itself, for failures with no usable API body. */
export const CLIENT_ERROR_CODES = {
  network: "network_error",
  unavailable: "service_unavailable",
  internal: "internal_error",
} as const;

const NETWORK_ERROR_MESSAGE =
  "Can't reach the booking server. Check your connection, then try again.";
const UNAVAILABLE_MESSAGE =
  "Booking is temporarily unavailable. Please try again in a minute.";
const UNKNOWN_ERROR_MESSAGE =
  "Something went wrong on our side. Please try again.";

// A proxy or gateway in front of the API may answer with plain text or HTML.
// These statuses mean "the API is down or busy", not "your request was wrong".
const UNAVAILABLE_STATUSES = [502, 503, 504];

/** An error returned by the API, in its shared `{code, message, conflicts}` shape. */
export class ApiError extends Error {
  readonly code: string;
  readonly conflicts: Conflict[];

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.code = body.code;
    this.conflicts = body.conflicts ?? [];
  }
}

/** Errors worth retrying as-is: nothing about the request needs to change. */
export function isTemporaryError(error: Error): boolean {
  const temporaryCodes: string[] = Object.values(CLIENT_ERROR_CODES);
  return error instanceof ApiError && temporaryCodes.includes(error.code);
}

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  const candidate = value as Partial<ApiErrorBody> | null;
  return (
    typeof candidate?.code === "string" && typeof candidate.message === "string"
  );
}

/** Turn a failed response into an ApiError, even when its body isn't ours. */
function buildApiError(error: unknown, response: Response): ApiError {
  if (isErrorBody(error)) {
    return new ApiError(error);
  }
  const isUnavailable = UNAVAILABLE_STATUSES.includes(response.status);
  const fallback = isUnavailable
    ? { code: CLIENT_ERROR_CODES.unavailable, message: UNAVAILABLE_MESSAGE }
    : { code: CLIENT_ERROR_CODES.internal, message: UNKNOWN_ERROR_MESSAGE };
  return new ApiError({ ...fallback, conflicts: [] });
}

async function sendRequest<T>(
  request: Promise<FetchResult<T>>,
): Promise<FetchResult<T>> {
  try {
    return await request;
  } catch {
    // fetch itself failed: no network, DNS, CORS, or the server is gone.
    throw new ApiError({
      code: CLIENT_ERROR_CODES.network,
      message: NETWORK_ERROR_MESSAGE,
      conflicts: [],
    });
  }
}

/** Return the response data, or throw an ApiError when the request failed. */
export async function unwrapResponse<T>(
  request: Promise<FetchResult<T>>,
): Promise<T> {
  const { data, error, response } = await sendRequest(request);
  if (error !== undefined || data === undefined) {
    throw buildApiError(error, response);
  }
  return data;
}
