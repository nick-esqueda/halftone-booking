import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Booking, EquipmentAvailability } from "../../api/types";
import { installFakeApi, respond } from "../../test/fakeApi";
import { BookerNameProvider } from "../identity/BookerNameContext";
import { BookingDialog, type BookingDialogRequest } from "./BookingDialog";

const CAMERA_A = {
  id: 1,
  name: "Camera A",
  category: "camera",
  description: "",
};
const CAMERA_B = {
  id: 2,
  name: "Camera B",
  category: "camera",
  description: "",
};
const CONFIG = { timezone: "America/Chicago", time_step_minutes: 15 };

const AVAILABILITY: { equipment: EquipmentAvailability[] } = {
  equipment: [
    { equipment: CAMERA_A, is_free: true, busy: [] },
    { equipment: CAMERA_B, is_free: true, busy: [] },
  ],
};

const NEW_BOOKING_REQUEST: BookingDialogRequest = {
  kind: "create",
  defaults: {
    bookerName: "Sam K",
    startDate: "2026-10-29",
    startTime: "10:00",
    endDate: "2026-10-29",
    endTime: "12:00",
    equipmentIds: [CAMERA_A.id],
  },
};

const EXISTING_BOOKING: Booking = {
  id: 7,
  booker_name: "Sam K",
  purpose: "Interview",
  starts_at: "2026-10-29T10:00:00-05:00",
  ends_at: "2026-10-29T12:00:00-05:00",
  is_cancelled: false,
  version: 3,
  items: [{ equipment_id: CAMERA_A.id, equipment_name: "Camera A" }],
} as Booking;

const BASE_ROUTES = {
  "GET /api/config": () => respond(200, CONFIG),
  "GET /api/availability": () => respond(200, AVAILABILITY),
  "GET /api/booker-names": () => respond(200, []),
  "GET /api/bookings/7": () => respond(200, EXISTING_BOOKING),
  "GET /api/bookings/7/history": () => respond(200, []),
};

function renderDialog(request: BookingDialogRequest) {
  const onClose = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BookerNameProvider>{children}</BookerNameProvider>
    </QueryClientProvider>
  );
  render(<BookingDialog request={request} onClose={onClose} />, { wrapper });
  return onClose;
}

beforeEach(() => {
  installFakeApi({ ...BASE_ROUTES });
});

describe("new booking", () => {
  it("sends the chosen items and studio times, then closes", async () => {
    const api = installFakeApi({
      ...BASE_ROUTES,
      "POST /api/bookings": () => respond(201, EXISTING_BOOKING),
    });
    const onClose = renderDialog(NEW_BOOKING_REQUEST);

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Camera B/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Book 2 items" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.requests("POST /api/bookings")).toEqual([
      {
        booker_name: "Sam K",
        purpose: "",
        equipment_ids: [CAMERA_A.id, CAMERA_B.id],
        starts_at: "2026-10-29T10:00",
        ends_at: "2026-10-29T12:00",
      },
    ]);
  });

  it("shows a clash from the server and stays open", async () => {
    installFakeApi({
      ...BASE_ROUTES,
      "POST /api/bookings": () =>
        respond(409, {
          code: "conflict",
          message: "Camera A is already booked by Ana, Thu 29 Oct 10:00-11:00.",
          conflicts: [
            {
              equipment_id: CAMERA_A.id,
              equipment_name: "Camera A",
              booking_id: 9,
              booker_name: "Ana",
              starts_at: "2026-10-29T10:00:00-05:00",
              ends_at: "2026-10-29T11:00:00-05:00",
            },
          ],
        }),
    });
    const onClose = renderDialog(NEW_BOOKING_REQUEST);

    await userEvent.click(
      await screen.findByRole("button", { name: "Book 1 item" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Camera A is already booked by Ana");
    expect(alert).toHaveTextContent("Nothing was saved.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a rule the server enforces, like the 7-day limit", async () => {
    installFakeApi({
      ...BASE_ROUTES,
      "POST /api/bookings": () =>
        respond(422, {
          code: "booking_too_long",
          message: "A booking can last at most 7 days.",
          conflicts: [],
        }),
    });
    const onClose = renderDialog(NEW_BOOKING_REQUEST);

    await userEvent.click(
      await screen.findByRole("button", { name: "Book 1 item" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A booking can last at most 7 days.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("checks the form before asking the server", async () => {
    const api = installFakeApi({ ...BASE_ROUTES });
    renderDialog(NEW_BOOKING_REQUEST);

    await userEvent.clear(await screen.findByLabelText("Booked by"));
    await userEvent.click(screen.getByRole("button", { name: "Book 1 item" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter your name.");
    expect(api.requests("POST /api/bookings")).toEqual([]);
  });

  it("can't be submitted with no items", async () => {
    renderDialog(NEW_BOOKING_REQUEST);

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Camera A/ }),
    );

    expect(screen.getByRole("button", { name: "Pick an item" })).toBeDisabled();
  });
});

describe("editing a booking", () => {
  it("sends the version it was loaded at", async () => {
    const api = installFakeApi({
      ...BASE_ROUTES,
      "PUT /api/bookings/7": () =>
        respond(200, { ...EXISTING_BOOKING, version: 4 }),
    });
    renderDialog({ kind: "edit", bookingId: 7 });

    await userEvent.selectOptions(
      await screen.findByLabelText("End time"),
      "13:00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(api.requests("PUT /api/bookings/7")).toEqual([
        expect.objectContaining({ ends_at: "2026-10-29T13:00", version: 3 }),
      ]),
    );
  });

  it("loads the other person's version after losing an edit race", async () => {
    const api = installFakeApi({
      ...BASE_ROUTES,
      "PUT /api/bookings/7": () =>
        respond(409, {
          code: "stale_version",
          message: "Someone else changed this booking since you opened it.",
          conflicts: [],
        }),
    });
    renderDialog({ kind: "edit", bookingId: 7 });
    const theirVersion = {
      ...EXISTING_BOOKING,
      ends_at: "2026-10-29T14:00:00-05:00",
      version: 4,
    };
    api.setRoute("GET /api/bookings/7", () => respond(200, theirVersion));

    await userEvent.click(
      await screen.findByRole("button", { name: "Save changes" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The latest version is shown now",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("End time")).toHaveValue("14:00"),
    );
  });

  it("asks before cancelling, then cancels with the version", async () => {
    const api = installFakeApi({
      ...BASE_ROUTES,
      "POST /api/bookings/7/cancel": () =>
        respond(200, { ...EXISTING_BOOKING, is_cancelled: true, version: 4 }),
    });
    const onClose = renderDialog({ kind: "edit", bookingId: 7 });

    await userEvent.click(
      await screen.findByRole("button", { name: /^Cancel$/ }),
    );
    expect(api.requests("POST /api/bookings/7/cancel")).toEqual([]);
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel booking" }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.requests("POST /api/bookings/7/cancel")).toEqual([
      { actor_name: "Sam K", version: 3 },
    ]);
  });
});
