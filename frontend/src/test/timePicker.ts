/** Test helpers for the hour / minutes / AM-PM time picker. */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ClockParts } from "../features/studio/clockTime";

/** Picks a time in the picker labelled `label`, e.g. "End time". */
export async function pickTime(label: string, time: ClockParts) {
  const picker = screen.getByRole("group", { name: label });
  const minuteText = String(time.minute);

  await userEvent.selectOptions(
    within(picker).getByLabelText(`${label} hour`),
    String(time.hour),
  );
  await userEvent.selectOptions(
    within(picker).getByLabelText(`${label} minutes`),
    minuteText,
  );
  await userEvent.click(
    within(picker).getByRole("button", { name: time.period }),
  );
}

/** The time a picker shows, e.g. "2:00 PM". */
export function readTime(label: string): string {
  const picker = screen.getByRole("group", { name: label });
  const hourSelect = within(picker).getByLabelText<HTMLSelectElement>(
    `${label} hour`,
  );
  const minuteSelect = within(picker).getByLabelText<HTMLSelectElement>(
    `${label} minutes`,
  );
  const period = within(picker).getByRole("button", { pressed: true });

  const minuteText = minuteSelect.selectedOptions[0]?.textContent ?? "";
  return `${hourSelect.value}:${minuteText} ${period.textContent}`;
}
