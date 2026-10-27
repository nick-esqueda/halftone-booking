import type { TZDate } from "@date-fns/tz";
import type { MouseEvent } from "react";

import type { BusySlot, EquipmentAvailability } from "../../api/types";
import { getCategoryStyle, HOUR_ROW_HEIGHT_PX } from "../../config/constants";
import { formatTime } from "../studio/studioTime";
import { describeInViewerTime, getViewerTimezone } from "../studio/viewerTime";
import {
  buildHourLabels,
  computeBlockPosition,
  computeTimeAtFraction,
  VISIBLE_HOUR_COUNT,
} from "./dayLayout";

interface DayTimelineProps {
  day: TZDate;
  rows: EquipmentAvailability[];
  timezone: string;
  timeStepMinutes: number;
  currentBookerName: string;
  onBookingClick: (bookingId: number) => void;
  onEmptySlotClick: (equipmentId: number, startTime: string) => void;
}

const TIMELINE_HEIGHT_PX = VISIBLE_HOUR_COUNT * HOUR_ROW_HEIGHT_PX;
const HOUR_LABELS = buildHourLabels();

/** One day: an hour column on the left, then one column per item. Purely presentational. */
export function DayTimeline(props: DayTimelineProps) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[640px]">
        <HourLabels />
        {props.rows.map((row) => (
          <EquipmentColumn key={row.equipment.id} row={row} {...props} />
        ))}
      </div>
    </div>
  );
}

function HourLabels() {
  return (
    <div className="w-14 shrink-0 pt-10">
      <div className="relative" style={{ height: TIMELINE_HEIGHT_PX }}>
        {HOUR_LABELS.map((label, index) => (
          <span
            key={label}
            className="absolute right-2 -translate-y-1/2 text-xs text-ink-faint"
            style={{ top: index * HOUR_ROW_HEIGHT_PX }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface EquipmentColumnProps extends DayTimelineProps {
  row: EquipmentAvailability;
}

function EquipmentColumn({
  row,
  day,
  timezone,
  timeStepMinutes,
  currentBookerName,
  onBookingClick,
  onEmptySlotClick,
}: EquipmentColumnProps) {
  const categoryStyle = getCategoryStyle(row.equipment.category);

  const handleColumnClick = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientY - bounds.top) / bounds.height;
    onEmptySlotClick(
      row.equipment.id,
      computeTimeAtFraction(day, fraction, timeStepMinutes),
    );
  };

  return (
    <div className="min-w-[96px] flex-1 border-l border-line">
      <div className="flex h-10 items-center justify-center gap-1.5 px-1 text-xs font-semibold">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${categoryStyle.dotClassName}`}
        />
        <span className="truncate">{row.equipment.name}</span>
      </div>
      <div
        role="button"
        tabIndex={-1}
        aria-label={`Book ${row.equipment.name}`}
        data-testid={`column-${row.equipment.id}`}
        className="relative cursor-pointer hover:bg-muted"
        style={{ height: TIMELINE_HEIGHT_PX }}
        onClick={handleColumnClick}
      >
        <HourLines />
        {row.busy.map((slot) => (
          <BookingBlock
            key={slot.booking_id}
            slot={slot}
            day={day}
            timezone={timezone}
            isMine={isSameName(slot.booker_name, currentBookerName)}
            onClick={onBookingClick}
          />
        ))}
      </div>
    </div>
  );
}

function isSameName(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function HourLines() {
  return (
    <>
      {HOUR_LABELS.map((label, index) => (
        <div
          key={label}
          className="pointer-events-none absolute inset-x-0 border-t border-line"
          style={{ top: index * HOUR_ROW_HEIGHT_PX }}
        />
      ))}
    </>
  );
}

interface BookingBlockProps {
  slot: BusySlot;
  day: TZDate;
  timezone: string;
  isMine: boolean;
  onClick: (bookingId: number) => void;
}

const MINE_CLASS_NAME = "border-accent bg-accent-soft";
const OTHERS_CLASS_NAME = "border-line-strong bg-muted";

function BookingBlock({
  slot,
  day,
  timezone,
  isMine,
  onClick,
}: BookingBlockProps) {
  const position = computeBlockPosition(slot.starts_at, slot.ends_at, day);
  if (position === null) {
    return null;
  }

  const timeRange = `${formatTime(slot.starts_at, timezone)}–${formatTime(slot.ends_at, timezone)}`;
  const name = isMine ? "You" : slot.booker_name;
  const details = [slot.booker_name, timeRange, slot.purpose]
    .filter(Boolean)
    .join(" · ");
  const viewerTime = describeInViewerTime(
    slot.starts_at,
    slot.ends_at,
    timezone,
    getViewerTimezone(),
  );
  const hoverText = viewerTime ? `${details}\n${viewerTime}` : details;
  return (
    <button
      type="button"
      title={hoverText}
      aria-label={details}
      onClick={(event) => {
        event.stopPropagation();
        onClick(slot.booking_id);
      }}
      className={`absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight ${isMine ? MINE_CLASS_NAME : OTHERS_CLASS_NAME}`}
      style={{
        top: `${position.topPercent}%`,
        height: `${position.heightPercent}%`,
      }}
    >
      <span className="block truncate font-semibold">{name}</span>
      <span className="block truncate text-ink-muted">{timeRange}</span>
    </button>
  );
}
