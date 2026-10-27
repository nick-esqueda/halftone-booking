import type { TZDate } from "@date-fns/tz";
import type { MouseEvent } from "react";

import type { BusySlot, EquipmentAvailability } from "../../api/types";
import { getCategoryStyle, MIN_HOUR_WIDTH_PX } from "../../config/constants";
import { formatTime } from "../studio/studioTime";
import { describeInViewerTime, getViewerTimezone } from "../studio/viewerTime";
import { groupByCategory } from "./categories";
import {
  buildHourLabels,
  computeBlockPosition,
  computeNowPercent,
  computeTimeAtFraction,
  VISIBLE_HOUR_COUNT,
} from "./dayLayout";

interface DayTimelineProps {
  day: TZDate;
  now: Date;
  rows: EquipmentAvailability[];
  timezone: string;
  timeStepMinutes: number;
  currentBookerName: string;
  onBookingClick: (bookingId: number) => void;
  onEmptySlotClick: (equipmentId: number, startTime: string) => void;
}

const HOUR_LABELS = buildHourLabels();
const MIN_TRACK_WIDTH_PX = VISIBLE_HOUR_COUNT * MIN_HOUR_WIDTH_PX;

// The item names stay pinned on the left while the hours scroll sideways.
const NAME_COLUMN_CLASS_NAME =
  "sticky left-0 z-20 w-28 shrink-0 bg-surface pr-2 sm:w-40";

/**
 * One day: one row per item, grouped by category, with hours running left to
 * right. Purely presentational.
 */
export function DayTimeline(props: DayTimelineProps) {
  const groups = groupByCategory(props.rows);
  const nowPercent = computeNowPercent(props.day, props.now);

  return (
    <div className="overflow-x-auto">
      <HourHeader />
      {groups.map((group) => (
        <section
          key={group.category}
          aria-label={getCategoryStyle(group.category).label}
        >
          <CategoryHeading category={group.category} />
          {group.rows.map((row) => (
            <EquipmentRow
              key={row.equipment.id}
              row={row}
              nowPercent={nowPercent}
              {...props}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function HourHeader() {
  return (
    <div className="flex">
      <div
        className={`${NAME_COLUMN_CLASS_NAME} text-[11px] font-semibold uppercase tracking-wide text-ink-faint`}
      >
        Equipment
      </div>
      <div
        className="relative h-6 flex-1"
        style={{ minWidth: MIN_TRACK_WIDTH_PX }}
      >
        {HOUR_LABELS.map((label, index) => (
          <span
            key={label}
            className="absolute pl-1 text-xs tabular-nums text-ink-faint"
            style={{ left: `${(index / VISIBLE_HOUR_COUNT) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function CategoryHeading({ category }: { category: string }) {
  const categoryStyle = getCategoryStyle(category);
  return (
    <div
      className={`${NAME_COLUMN_CLASS_NAME} pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted`}
    >
      {categoryStyle.label}
    </div>
  );
}

interface EquipmentRowProps extends DayTimelineProps {
  row: EquipmentAvailability;
  nowPercent: number | null;
}

function EquipmentRow({
  row,
  day,
  nowPercent,
  timezone,
  timeStepMinutes,
  currentBookerName,
  onBookingClick,
  onEmptySlotClick,
}: EquipmentRowProps) {
  const categoryStyle = getCategoryStyle(row.equipment.category);

  const handleTrackClick = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - bounds.left) / bounds.width;
    onEmptySlotClick(
      row.equipment.id,
      computeTimeAtFraction(day, fraction, timeStepMinutes),
    );
  };

  return (
    <div className="flex border-t border-line">
      <div
        className={`${NAME_COLUMN_CLASS_NAME} flex items-center gap-1.5 text-sm`}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${categoryStyle.dotClassName}`}
        />
        <span className="truncate">{row.equipment.name}</span>
      </div>
      <div
        role="button"
        tabIndex={-1}
        aria-label={`Book ${row.equipment.name}`}
        data-testid={`row-${row.equipment.id}`}
        className="relative h-12 flex-1 cursor-pointer hover:bg-muted"
        style={{ minWidth: MIN_TRACK_WIDTH_PX }}
        onClick={handleTrackClick}
      >
        <HourLines />
        {nowPercent !== null && <NowLine percent={nowPercent} />}
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
          className="pointer-events-none absolute inset-y-0 border-l border-line"
          style={{ left: `${(index / VISIBLE_HOUR_COUNT) * 100}%` }}
        />
      ))}
    </>
  );
}

function NowLine({ percent }: { percent: number }) {
  return (
    <div
      data-testid="now-line"
      className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-danger"
      style={{ left: `${percent}%` }}
    />
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
      className={`absolute inset-y-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight ${isMine ? MINE_CLASS_NAME : OTHERS_CLASS_NAME}`}
      style={{
        left: `${position.leftPercent}%`,
        width: `${position.widthPercent}%`,
      }}
    >
      <span className="block truncate font-semibold">{name}</span>
      <span className="block truncate text-ink-muted">{timeRange}</span>
    </button>
  );
}
