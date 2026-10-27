import { describe, expect, it } from "vitest";

import type { Booking } from "../../api/types";
import {
  buildBookingRequest,
  buildFormValuesFromBooking,
  findFormProblems,
  type BookingFormValues,
  toggleEquipment,
} from "./bookingForm";

const VALID_VALUES: BookingFormValues = {
  bookerName: "Sam K",
  purpose: "Interview",
  startDate: "2026-10-29",
  startTime: "13:00",
  endDate: "2026-10-29",
  endTime: "15:00",
  equipmentIds: [1, 4],
};

describe("findFormProblems", () => {
  it("accepts a complete form", () => {
    expect(findFormProblems(VALID_VALUES)).toEqual([]);
  });

  it("lists every missing piece", () => {
    const problems = findFormProblems({
      ...VALID_VALUES,
      bookerName: "  ",
      equipmentIds: [],
      endTime: "12:00",
    });
    expect(problems).toEqual([
      "Enter your name.",
      "Pick at least one item.",
      "The end must be after the start.",
    ]);
  });

  it("allows a booking that ends on a later day", () => {
    const overnight = {
      ...VALID_VALUES,
      endDate: "2026-10-30",
      endTime: "01:00",
    };
    expect(findFormProblems(overnight)).toEqual([]);
  });
});

describe("buildBookingRequest", () => {
  it("sends wall-clock times for the API to interpret", () => {
    expect(buildBookingRequest(VALID_VALUES)).toEqual({
      booker_name: "Sam K",
      purpose: "Interview",
      equipment_ids: [1, 4],
      starts_at: "2026-10-29T13:00",
      ends_at: "2026-10-29T15:00",
    });
  });
});

describe("buildFormValuesFromBooking", () => {
  it("fills the form in studio time", () => {
    const booking = {
      id: 7,
      booker_name: "Sam K",
      purpose: "Interview",
      starts_at: "2026-10-29T13:00:00-05:00",
      ends_at: "2026-10-29T15:00:00-05:00",
      is_cancelled: false,
      version: 1,
      items: [{ equipment_id: 1, equipment_name: "Camera A" }],
    } as Booking;

    const values = buildFormValuesFromBooking(booking, "America/Chicago");

    expect(values).toEqual({
      ...VALID_VALUES,
      equipmentIds: [1],
    });
  });
});

describe("toggleEquipment", () => {
  it("adds and removes an item", () => {
    expect(toggleEquipment([1], 4)).toEqual([1, 4]);
    expect(toggleEquipment([1, 4], 1)).toEqual([4]);
  });
});
