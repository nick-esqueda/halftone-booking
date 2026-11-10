import { TEST_USERS } from "./renderWithProviders";
import { respond } from "./fakeApi";

const CONFIG = {
  timezone: "America/Chicago",
  time_step_minutes: 15,
  assistant_enabled: false,
};
const CAMERA_A = {
  id: 1,
  name: "Camera A",
  category: "camera",
  description: "",
};
const AVAILABILITY = {
  equipment: [{ equipment: CAMERA_A, is_free: true, busy: [] }],
};

/** Fake API routes for rendering the whole app while logged in. */
export const APP_ROUTES = {
  "GET /api/config": () => respond(200, CONFIG),
  "GET /api/availability": () => respond(200, AVAILABILITY),
  "GET /api/users": () => respond(200, TEST_USERS),
  "GET /api/users/1": () => respond(200, TEST_USERS[0]),
  "GET /api/users/2": () => respond(200, TEST_USERS[1]),
  "GET /api/users/3": () => respond(200, TEST_USERS[2]),
  "GET /api/bookings": () => respond(200, []),
};
