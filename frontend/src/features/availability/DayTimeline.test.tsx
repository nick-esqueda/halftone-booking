import { TZDate } from "@date-fns/tz";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EquipmentAvailability } from "../../api/types";
import { DayTimeline } from "./DayTimeline";
import { countHours, HOUR_RANGES, type HourRange } from "./dayLayout";

const ZONE = "America/Chicago";
const THURSDAY = new TZDate(2026, 9, 29, 0, 0, ZONE);
const THURSDAY_10_30 = new Date("2026-10-29T15:30:00Z");
const FRIDAY_10_30 = new Date("2026-10-30T15:30:00Z");
const TRACK_WIDTH_PX = countHours(HOUR_RANGES.studioHours) * 100;

function buildRow(
  id: number,
  name: string,
  category: string,
): EquipmentAvailability {
  return {
    equipment: { id, name, category, description: "" },
    is_free: true,
    busy: [],
  };
}

const CAMERA_A = buildRow(1, "Camera A", "camera");
const KIT_1 = buildRow(4, "Lighting Kit 1", "lighting");
const CAMERA_B = buildRow(2, "Camera B", "camera");

// 10:00-12:00 Chicago.
const BOOKED_CAMERA_A: EquipmentAvailability = {
  ...CAMERA_A,
  busy: [
    {
      booking_id: 7,
      booker_name: "Priya",
      purpose: "Brand shoot",
      starts_at: "2026-10-29T15:00:00Z",
      ends_at: "2026-10-29T17:00:00Z",
    },
  ],
};

function renderTimeline(
  rows: EquipmentAvailability[],
  overrides: { now?: Date; hourRange?: HourRange } = {},
) {
  const handlers = {
    onBookingClick: vi.fn(),
    onEmptySlotClick: vi.fn(),
  };
  render(
    <DayTimeline
      day={THURSDAY}
      now={overrides.now ?? THURSDAY_10_30}
      rows={rows}
      hourRange={overrides.hourRange ?? HOUR_RANGES.studioHours}
      timezone={ZONE}
      timeStepMinutes={15}
      currentBookerName="Ben"
      {...handlers}
    />,
  );
  return handlers;
}

describe("DayTimeline", () => {
  it("shows one row per item, grouped under its category", () => {
    renderTimeline([CAMERA_A, KIT_1, CAMERA_B]);

    const cameras = screen.getByRole("region", { name: "Cameras" });
    expect(within(cameras).getByText("Camera A")).toBeInTheDocument();
    expect(within(cameras).getByText("Camera B")).toBeInTheDocument();
    const lighting = screen.getByRole("region", { name: "Lighting" });
    expect(within(lighting).getByText("Lighting Kit 1")).toBeInTheDocument();
  });

  it("books the clicked item at the hour under the pointer", () => {
    const { onEmptySlotClick } = renderTimeline([CAMERA_A]);
    const track = screen.getByTestId("row-1");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: TRACK_WIDTH_PX, height: 48 }),
    );

    // Three and a half hours after 07:00, with 100px per hour.
    fireEvent.click(track, { clientX: 350 });

    expect(onEmptySlotClick).toHaveBeenCalledWith(1, "10:30");
  });

  it("opens a booking when its bar is clicked", async () => {
    const { onBookingClick, onEmptySlotClick } = renderTimeline([
      BOOKED_CAMERA_A,
    ]);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Priya · 10:00 AM–12:00 PM · Brand shoot",
      }),
    );

    expect(onBookingClick).toHaveBeenCalledWith(7);
    expect(onEmptySlotClick).not.toHaveBeenCalled();
  });

  it("names both days on a booking that started the day before", () => {
    const overnight: EquipmentAvailability = {
      ...CAMERA_A,
      busy: [
        {
          ...BOOKED_CAMERA_A.busy[0],
          // Wed 6 PM to Thu 12 PM Chicago.
          starts_at: "2026-10-28T23:00:00Z",
          ends_at: "2026-10-29T17:00:00Z",
        },
      ],
    };
    renderTimeline([overnight]);

    const block = screen.getByRole("button", {
      name: "Priya · Wed 6:00 PM–Thu 12:00 PM · Brand shoot",
    });
    expect(block).toHaveTextContent("‹ Wed 6:00 PM–Thu 12:00 PM");
    expect(block).toHaveClass("rounded-l-none");
    expect(block).not.toHaveClass("rounded-r-none");
  });

  it("shows bookings outside studio hours when all hours are shown", () => {
    const early: EquipmentAvailability = {
      ...CAMERA_A,
      busy: [
        {
          ...BOOKED_CAMERA_A.busy[0],
          // 05:00-06:00 Chicago.
          starts_at: "2026-10-29T10:00:00Z",
          ends_at: "2026-10-29T11:00:00Z",
        },
      ],
    };
    renderTimeline([early]);
    expect(screen.queryByRole("button", { name: /^Priya/ })).toBeNull();

    renderTimeline([early], { hourRange: HOUR_RANGES.allDay });
    expect(
      screen.getByRole("button", { name: /^Priya · 5:00 AM–6:00 AM/ }),
    ).toBeInTheDocument();
  });

  it("marks the current time on today, labelled with the time", () => {
    renderTimeline([CAMERA_A]);
    expect(screen.getByTestId("now-line")).toBeInTheDocument();
    expect(screen.getByTestId("now-label")).toHaveTextContent("Now 10:30 AM");
  });

  it("leaves out the current-time line on other days", () => {
    renderTimeline([CAMERA_A], { now: FRIDAY_10_30 });
    expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("now-label")).not.toBeInTheDocument();
  });
});
