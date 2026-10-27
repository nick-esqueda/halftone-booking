import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { readTime } from "../../test/timePicker";
import { TimePicker } from "./TimePicker";

function renderPicker(value: string) {
  const onChange = vi.fn();
  render(
    <TimePicker
      label="Start time"
      value={value}
      stepMinutes={15}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("TimePicker", () => {
  it("shows a 24-hour value on the 12-hour clock", () => {
    renderPicker("14:30");
    expect(readTime("Start time")).toBe("2:30 PM");
  });

  it("offers only the minutes on the booking step", () => {
    renderPicker("09:00");
    const minuteSelect = screen.getByLabelText("Start time minutes");
    const minuteOptions = within(minuteSelect).getAllByRole("option");
    expect(minuteOptions.map((option) => option.textContent)).toEqual([
      "00",
      "15",
      "30",
      "45",
    ]);
  });

  it("keeps the hour and minutes when switching to PM", async () => {
    const onChange = renderPicker("09:15");
    await userEvent.click(screen.getByRole("button", { name: "PM" }));
    expect(onChange).toHaveBeenCalledWith("21:15");
  });

  it("treats 12 AM as midnight", async () => {
    const onChange = renderPicker("01:00");
    await userEvent.selectOptions(
      screen.getByLabelText("Start time hour"),
      "12",
    );
    expect(onChange).toHaveBeenCalledWith("00:00");
  });
});
