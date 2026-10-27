import { describe, expect, it } from "vitest";

import {
  failNetwork,
  installFakeApi,
  respond,
  respondWithText,
} from "../test/fakeApi";
import {
  ApiError,
  apiClient,
  isTemporaryError,
  unwrapResponse,
} from "./client";

const CONFIG_ROUTE = "GET /api/config";

async function loadConfigExpectingError(): Promise<ApiError> {
  try {
    await unwrapResponse(apiClient.GET("/api/config"));
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the request to fail");
}

describe("unwrapResponse", () => {
  it("returns the data on success", async () => {
    const config = { timezone: "America/Chicago", time_step_minutes: 15 };
    installFakeApi({ [CONFIG_ROUTE]: () => respond(200, config) });
    await expect(unwrapResponse(apiClient.GET("/api/config"))).resolves.toEqual(
      config,
    );
  });

  it("keeps the API's own error code, message and conflicts", async () => {
    const body = {
      code: "not_found",
      message: "Booking 7 doesn't exist.",
      conflicts: [],
    };
    installFakeApi({ [CONFIG_ROUTE]: () => respond(404, body) });

    const error = await loadConfigExpectingError();

    expect(error.code).toBe("not_found");
    expect(error.message).toBe("Booking 7 doesn't exist.");
    expect(isTemporaryError(error)).toBe(false);
  });

  it("reports the network failing as a connection problem", async () => {
    installFakeApi({ [CONFIG_ROUTE]: failNetwork });

    const error = await loadConfigExpectingError();

    expect(error.code).toBe("network_error");
    expect(error.message).toMatch(/Can't reach the booking server/);
    expect(isTemporaryError(error)).toBe(true);
  });

  it("passes on the API's 503 when the database is down", async () => {
    const body = {
      code: "service_unavailable",
      message:
        "Booking is temporarily unavailable. Please try again in a minute.",
      conflicts: [],
    };
    installFakeApi({ [CONFIG_ROUTE]: () => respond(503, body) });

    const error = await loadConfigExpectingError();

    expect(error.code).toBe("service_unavailable");
    expect(isTemporaryError(error)).toBe(true);
  });

  it.each([502, 503, 504])(
    "treats a %i page from a proxy as temporarily unavailable",
    async (status) => {
      installFakeApi({
        [CONFIG_ROUTE]: () => respondWithText(status, "<h1>Bad gateway</h1>"),
      });

      const error = await loadConfigExpectingError();

      expect(error.code).toBe("service_unavailable");
      expect(error.message).not.toContain("<h1>");
    },
  );

  it("turns any other non-JSON failure into a readable message", async () => {
    installFakeApi({
      [CONFIG_ROUTE]: () => respondWithText(500, "Internal Server Error"),
    });

    const error = await loadConfigExpectingError();

    expect(error.code).toBe("internal_error");
    expect(error.message).toBe(
      "Something went wrong on our side. Please try again.",
    );
  });
});
