/**
 * A stand-in for the backend in component tests. Each test lists the
 * responses it needs as a lookup of "METHOD /path" to a handler; any request
 * without a route fails the test loudly.
 *
 * Usage:
 *   const api = installFakeApi({ "GET /api/config": () => respond(200, config) });
 *   ...
 *   expect(api.requests("POST /api/bookings")[0]).toEqual({...});
 */
type RouteHandler = (body: unknown, url: URL) => Response;
type Routes = Record<string, RouteHandler>;

interface RecordedRequest {
  route: string;
  body: unknown;
}

const NO_BODY_METHODS = ["GET", "HEAD"];

let currentRoutes: Routes = {};
let recordedRequests: RecordedRequest[] = [];

export function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A non-JSON reply, like the HTML page a proxy sends when the API is down. */
export function respondWithText(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/html" },
  });
}

/** Simulates the network failing: fetch rejects, as when the server is gone. */
export function failNetwork(): never {
  throw new TypeError("Failed to fetch");
}

async function readBody(request: Request): Promise<unknown> {
  if (NO_BODY_METHODS.includes(request.method)) {
    return undefined;
  }
  return request.json();
}

/** The fetch that setup.ts installs for every test. */
export async function fakeFetch(input: Request): Promise<Response> {
  const url = new URL(input.url);
  const route = `${input.method} ${url.pathname}`;
  const handler = currentRoutes[route];
  if (handler === undefined) {
    throw new Error(`Fake API has no route for ${route}`);
  }
  const body = await readBody(input);
  recordedRequests.push({ route, body });
  return handler(body, url);
}

export function installFakeApi(routes: Routes) {
  currentRoutes = routes;
  recordedRequests = [];
  return {
    /** Bodies sent to a route, oldest first. */
    requests: (route: string) =>
      recordedRequests
        .filter((request) => request.route === route)
        .map((request) => request.body),
    /** Swap one route's handler, e.g. to return newer data on refetch. */
    setRoute: (route: string, handler: RouteHandler) => {
      currentRoutes[route] = handler;
    },
  };
}
