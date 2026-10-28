import type { TZDate } from "@date-fns/tz";
import { isSameDay } from "date-fns";
import type { MouseEvent } from "react";

import type { BusySlot, EquipmentAvailability } from "../../api/types";
import { getCategoryStyle } from "../../config/constants";
import { formatTime, formatWeekday, toStudioDate } from "../studio/studioTime";
import { describeInViewerTime, getViewerTimezone } from "../studio/viewerTime";
import { groupByCategory } from "./categories";
import {
  buildHourMarks,
  computeBlockPosition,
  computeNowPercent,
  computeTimeAtFraction,
  countHours,
  type BlockPosition,
  type HourMark,
  type HourRange,
} from "./dayLayout";

interface DayTimelineProps {
  day: TZDate;
  now: Date;
  rows: EquipmentAvailability[];
  hourRange: HourRange;
  timezone: string;
  timeStepMinutes: number;
  currentBookerName: string;
  onBookingClick: (bookingId: number) => void;
  onEmptySlotClick: (equipmentId: number, startTime: string) => void;
}

// The item names stay pinned on the left while the hours scroll sideways.
const NAME_COLUMN_CLASS_NAME =
  "sticky left-0 z-[2] w-28 shrink-0 bg-surface pr-2 sm:w-40";

/**
 * One day: one row per item, grouped by category, with hours running left to
 * right. Purely presentational.
 */
export function DayTimeline(props: DayTimelineProps) {
  const groups = groupByCategory(props.rows);
  const nowPercent = computeNowPercent(props.day, props.now, props.hourRange);
  const nowLabel = formatTime(props.now.toISOString(), props.timezone);
  const hourMarks = buildHourMarks(props.day, props.hourRange);
  const trackWidthPx =
    countHours(props.hourRange) * props.hourRange.minHourWidthPx;

  return (
    <div className="overflow-x-auto">
      {/* As wide as the scrolled content, so the pinned names stay pinned to the end. */}
      <div className="w-max min-w-full">
        <HourHeader
          hourMarks={hourMarks}
          trackWidthPx={trackWidthPx}
          nowPercent={nowPercent}
          nowLabel={nowLabel}
        />
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
                hourMarks={hourMarks}
                trackWidthPx={trackWidthPx}
                {...props}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

interface TrackProps {
  hourMarks: HourMark[];
  trackWidthPx: number;
}

interface HourHeaderProps extends TrackProps {
  nowPercent: number | null;
  nowLabel: string;
}

function HourHeader({
  hourMarks,
  trackWidthPx,
  nowPercent,
  nowLabel,
}: HourHeaderProps) {
  return (
    <div className="flex">
      <div
        className={`${NAME_COLUMN_CLASS_NAME} text-[11px] font-semibold uppercase tracking-wide text-ink-faint`}
      >
        Equipment
      </div>
      <div className="relative h-10 flex-1" style={{ minWidth: trackWidthPx }}>
        {hourMarks.map((mark) => (
          <span
            key={mark.percent}
            className="absolute top-0 whitespace-nowrap pl-1 text-xs tabular-nums text-ink-faint"
            style={{ left: `${mark.percent}%` }}
          >
            {mark.label}
          </span>
        ))}
        {nowPercent !== null && (
          <NowLabel percent={nowPercent} label={nowLabel} />
        )}
      </div>
    </div>
  );
}

/** A small "Now 3:44 PM" tag on top of the current-time line. */
function NowLabel({ percent, label }: { percent: number; label: string }) {
  return (
    <span
      data-testid="now-label"
      className="absolute bottom-1 z-[1] -translate-x-1/2 whitespace-nowrap rounded bg-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-surface"
      style={{ left: `${percent}%` }}
    >
      Now {label}
    </span>
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

interface EquipmentRowProps extends DayTimelineProps, TrackProps {
  row: EquipmentAvailability;
  nowPercent: number | null;
}

function EquipmentRow({
  row,
  day,
  hourRange,
  hourMarks,
  trackWidthPx,
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
      computeTimeAtFraction(day, fraction, timeStepMinutes, hourRange),
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
        style={{ minWidth: trackWidthPx }}
        onClick={handleTrackClick}
      >
        <HourLines hourMarks={hourMarks} />
        {nowPercent !== null && <NowLine percent={nowPercent} />}
        {row.busy.map((slot) => (
          <BookingBlock
            key={slot.booking_id}
            slot={slot}
            day={day}
            hourRange={hourRange}
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

function HourLines({ hourMarks }: { hourMarks: HourMark[] }) {
  return (
    <>
      {hourMarks.map((mark) => (
        <div
          key={mark.percent}
          className="pointer-events-none absolute inset-y-0 border-l border-line"
          style={{ left: `${mark.percent}%` }}
        />
      ))}
    </>
  );
}

function NowLine({ percent }: { percent: number }) {
  return (
    <div
      data-testid="now-line"
      className="pointer-events-none absolute inset-y-0 z-[1] w-0.5 bg-danger"
      style={{ left: `${percent}%` }}
    />
  );
}

interface BookingBlockProps {
  slot: BusySlot;
  day: TZDate;
  hourRange: HourRange;
  timezone: string;
  isMine: boolean;
  onClick: (bookingId: number) => void;
}

const MINE_CLASS_NAME = "border-accent bg-accent-soft";
const OTHERS_CLASS_NAME = "border-line-strong bg-muted";
// A block that runs past the visible hours has a square, open edge there.
const CONTINUES_BEFORE_CLASS_NAME = "rounded-l-none border-l-0";
const CONTINUES_AFTER_CLASS_NAME = "rounded-r-none border-r-0";

/** "6:00 PM–8:00 PM", or with weekdays when the booking spans days. */
function describeBlockTime(slot: BusySlot, timezone: string): string {
  const start = toStudioDate(slot.starts_at, timezone);
  const end = toStudioDate(slot.ends_at, timezone);
  const startTime = formatTime(slot.starts_at, timezone);
  const endTime = formatTime(slot.ends_at, timezone);
  if (isSameDay(start, end)) {
    return `${startTime}–${endTime}`;
  }
  return `${formatWeekday(start)} ${startTime}–${formatWeekday(end)} ${endTime}`;
}

function describeEdges(position: BlockPosition): string {
  const before = position.continuesBefore ? CONTINUES_BEFORE_CLASS_NAME : "";
  const after = position.continuesAfter ? CONTINUES_AFTER_CLASS_NAME : "";
  return `${before} ${after}`;
}

function BookingBlock({
  slot,
  day,
  hourRange,
  timezone,
  isMine,
  onClick,
}: BookingBlockProps) {
  const position = computeBlockPosition(
    slot.starts_at,
    slot.ends_at,
    day,
    hourRange,
  );
  if (position === null) {
    return null;
  }

  const timeRange = describeBlockTime(slot, timezone);
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
      className={`absolute inset-y-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight ${isMine ? MINE_CLASS_NAME : OTHERS_CLASS_NAME} ${describeEdges(position)}`}
      style={{
        left: `${position.leftPercent}%`,
        width: `${position.widthPercent}%`,
      }}
    >
      <span className="block truncate font-semibold">{name}</span>
      <span className="block truncate text-ink-muted">
        {position.continuesBefore && <span aria-hidden="true">‹ </span>}
        {timeRange}
        {position.continuesAfter && <span aria-hidden="true"> ›</span>}
      </span>
    </button>
  );
}
