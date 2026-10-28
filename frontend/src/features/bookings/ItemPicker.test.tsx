import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EquipmentAvailability } from "../../api/types";
import { ItemPicker } from "./ItemPicker";

const ZONE = "America/Chicago";

function buildRow(
  id: number,
  name: string,
  busyBy?: string,
): EquipmentAvailability {
  const busy = busyBy
    ? [
        {
          booking_id: 99,
          booker_name: busyBy,
          purpose: "",
          starts_at: "2026-10-29T18:00:00Z",
          ends_at: "2026-10-29T20:00:00Z",
        },
      ]
    : [];
  return {
    equipment: { id, name, category: "camera", description: "" },
    is_free: busy.length === 0,
    busy,
  };
}

const ROWS = [buildRow(1, "Camera A", "Ana"), buildRow(2, "Camera B")];

function renderPicker(selectedIds: number[], onToggle = vi.fn()) {
  render(
    <ItemPicker
      rows={ROWS}
      selectedIds={selectedIds}
      conflictingIds={[]}
      timezone={ZONE}
      onToggle={onToggle}
    />,
  );
  return onToggle;
}

describe("ItemPicker", () => {
  it("shows who has a taken item and when", () => {
    renderPicker([]);
    expect(
      screen.getByText("Taken by Ana, Thu 29 Oct, 1:00 PM – 3:00 PM"),
    ).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it("disables taken items", () => {
    renderPicker([]);
    expect(screen.getByRole("checkbox", { name: /Camera A/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Camera B/ })).toBeEnabled();
  });

  it("keeps a taken item clickable while selected, so it can be unticked", async () => {
    const onToggle = renderPicker([1]);
    await userEvent.click(screen.getByRole("checkbox", { name: /Camera A/ }));
    expect(onToggle).toHaveBeenCalledWith(1);
  });
});
