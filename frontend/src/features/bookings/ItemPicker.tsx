import type { EquipmentAvailability } from "../../api/types";
import { getCategoryStyle } from "../../config/constants";
import { formatTimeRange } from "../studio/studioTime";

interface ItemPickerProps {
  rows: EquipmentAvailability[];
  selectedIds: number[];
  conflictingIds: number[];
  timezone: string;
  onToggle: (equipmentId: number) => void;
}

/** Checklist of items, each marked Free or Taken for the chosen times. */
export function ItemPicker({
  rows,
  selectedIds,
  conflictingIds,
  timezone,
  onToggle,
}: ItemPickerProps) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {rows.map((row) => (
        <ItemRow
          key={row.equipment.id}
          row={row}
          isSelected={selectedIds.includes(row.equipment.id)}
          isConflicting={conflictingIds.includes(row.equipment.id)}
          timezone={timezone}
          onToggle={() => onToggle(row.equipment.id)}
        />
      ))}
    </ul>
  );
}

interface ItemRowProps {
  row: EquipmentAvailability;
  isSelected: boolean;
  isConflicting: boolean;
  timezone: string;
  onToggle: () => void;
}

function describeStatus(row: EquipmentAvailability, timezone: string): string {
  const firstBusySlot = row.busy[0];
  if (firstBusySlot === undefined) {
    return "Free";
  }
  const timeRange = formatTimeRange(
    firstBusySlot.starts_at,
    firstBusySlot.ends_at,
    timezone,
  );
  return `Taken by ${firstBusySlot.booker_name}, ${timeRange}`;
}

type ItemStatus = "free" | "clashing" | "taken";

const STATUS_CLASS_NAMES: Record<ItemStatus, string> = {
  free: "text-success",
  clashing: "text-danger",
  taken: "text-ink-faint",
};

function getItemStatus(
  row: EquipmentAvailability,
  isFlagged: boolean,
): ItemStatus {
  if (row.is_free) {
    return "free";
  }
  return isFlagged ? "clashing" : "taken";
}

function ItemRow({
  row,
  isSelected,
  isConflicting,
  timezone,
  onToggle,
}: ItemRowProps) {
  const isTaken = !row.is_free;
  // A taken item stays clickable while selected, so it can be unticked.
  const isDisabled = isTaken && !isSelected;
  const isFlagged = isConflicting || (isTaken && isSelected);
  const statusClassName = STATUS_CLASS_NAMES[getItemStatus(row, isFlagged)];
  const categoryStyle = getCategoryStyle(row.equipment.category);

  return (
    <li className={isFlagged ? "bg-danger-soft" : ""}>
      <label
        className={`flex items-center gap-3 px-3 py-2 text-sm ${isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          disabled={isDisabled}
          onChange={onToggle}
          className="h-4 w-4 accent-accent"
        />
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${categoryStyle.dotClassName}`}
        />
        <span className={isFlagged ? "font-semibold" : ""}>
          {row.equipment.name}
        </span>
        <span className={`ml-auto text-right text-xs ${statusClassName}`}>
          {describeStatus(row, timezone)}
        </span>
      </label>
    </li>
  );
}
