import { TZDate } from "@date-fns/tz";
import { addWeeks, startOfDay } from "date-fns";
import { useState } from "react";

import {
  CURRENT_TIME_REFRESH_MS,
  DAY_VIEW_END_HOUR,
  DAY_VIEW_START_HOUR,
  DEFAULT_BOOKING_HOURS,
  DEFAULT_BOOKING_START_HOUR,
  DAYS_PER_WEEK,
} from "../config/constants";
import type { DraftBooking } from "../api/types";
import { AssistantPanel } from "../features/assistant/AssistantPanel";
import { buildDefaultsFromDraft } from "../features/assistant/assistantConversation";
import { isInCategory } from "../features/availability/categories";
import { CategoryFilter } from "../features/availability/CategoryFilter";
import { DayTabs } from "../features/availability/DayTabs";
import { DayTimeline } from "../features/availability/DayTimeline";
import { useAvailability } from "../features/availability/useAvailability";
import {
  BookingDialog,
  type BookingDialogRequest,
} from "../features/bookings/BookingDialog";
import type { NewBookingDefaults } from "../features/bookings/bookingFormValues";
import { useBookerNameContext } from "../features/identity/bookerNameStore";
import { Button } from "../components/ui/Button";
import { LoadError } from "../components/ui/LoadError";
import {
  addHoursToWallClock,
  buildDayRange,
  buildWeekDays,
  formatDateInput,
  formatLongDay,
  getWeekStart,
  pickDefaultStartTime,
  toStudioDate,
} from "../features/studio/studioTime";
import { useCurrentTime } from "../features/studio/useCurrentTime";
import { useStudioConfig } from "../features/studio/useStudioConfig";
import { formatHourLabel } from "../features/studio/clockTime";
import { describeZone } from "../features/studio/viewerTime";

const ALL_CATEGORIES = "all";

export function SchedulePage() {
  const configQuery = useStudioConfig();
  const config = configQuery.data;
  if (configQuery.error) {
    return (
      <LoadError
        subject="the studio settings"
        error={configQuery.error}
        onRetry={() => void configQuery.refetch()}
        isRetrying={configQuery.isFetching}
      />
    );
  }
  if (config === undefined) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }
  return (
    <Schedule
      timezone={config.timezone}
      timeStepMinutes={config.time_step_minutes}
      isAssistantEnabled={config.assistant_enabled}
    />
  );
}

interface ScheduleProps {
  timezone: string;
  timeStepMinutes: number;
  isAssistantEnabled: boolean;
}

function Schedule({
  timezone,
  timeStepMinutes,
  isAssistantEnabled,
}: ScheduleProps) {
  const now = useCurrentTime(CURRENT_TIME_REFRESH_MS);
  const today = new TZDate(now, timezone);
  const todayStart = new TZDate(startOfDay(today), timezone);
  const [selectedDay, setSelectedDay] = useState(todayStart);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [dialogRequest, setDialogRequest] =
    useState<BookingDialogRequest | null>(null);
  const { bookerName } = useBookerNameContext();
  const availability = useAvailability(buildDayRange(selectedDay));

  const weekDays = buildWeekDays(
    getWeekStart(selectedDay, timezone),
    DAYS_PER_WEEK,
  );
  const rows = (availability.data?.equipment ?? []).filter((row) =>
    isInCategory(row.equipment.category, selectedCategory),
  );

  const openNewBooking = (equipmentIds: number[], startTime: string) => {
    const start = { date: formatDateInput(selectedDay), time: startTime };
    const end = addHoursToWallClock(start, DEFAULT_BOOKING_HOURS, timezone);
    const defaults: NewBookingDefaults = {
      bookerName,
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      equipmentIds,
    };
    setDialogRequest({ kind: "create", defaults });
  };

  // Show the draft's day behind the form, so the person sees what's around it.
  const openDraft = (draft: DraftBooking) => {
    const draftStart = toStudioDate(draft.starts_at, timezone);
    setSelectedDay(new TZDate(startOfDay(draftStart), timezone));
    const defaults = buildDefaultsFromDraft(draft, bookerName, timezone);
    setDialogRequest({ kind: "create", defaults });
  };

  const showWeekOffset = (weekOffset: number) => {
    setSelectedDay(new TZDate(addWeeks(selectedDay, weekOffset), timezone));
  };

  return (
    <div className="space-y-4">
      {isAssistantEnabled && <AssistantPanel onOpenDraft={openDraft} />}
      <DayTabs
        days={weekDays}
        selectedDay={selectedDay}
        today={today}
        onSelectDay={setSelectedDay}
        onPreviousWeek={() => showWeekOffset(-1)}
        onNextWeek={() => showWeekOffset(1)}
        onToday={() => setSelectedDay(todayStart)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <CategoryFilter
          selectedCategory={selectedCategory}
          onChange={setSelectedCategory}
        />
        <Button
          variant="primary"
          className="ml-auto"
          onClick={() =>
            openNewBooking(
              [],
              pickDefaultStartTime(
                selectedDay,
                today,
                DEFAULT_BOOKING_START_HOUR,
              ),
            )
          }
        >
          + New booking
        </Button>
      </div>
      {availability.error && (
        <LoadError
          subject="the schedule"
          error={availability.error}
          onRetry={() => void availability.refetch()}
          isRetrying={availability.isFetching}
        />
      )}
      {availability.isPending && (
        <p className="text-sm text-ink-muted">Loading the schedule…</p>
      )}
      {availability.data && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
          <DayHeading day={selectedDay} timezone={timezone} />
          <DayTimeline
            day={selectedDay}
            now={today}
            rows={rows}
            timezone={timezone}
            timeStepMinutes={timeStepMinutes}
            currentBookerName={bookerName}
            onBookingClick={(bookingId) =>
              setDialogRequest({ kind: "edit", bookingId })
            }
            onEmptySlotClick={(equipmentId, startTime) =>
              openNewBooking([equipmentId], startTime)
            }
          />
        </div>
      )}
      <p className="text-xs text-ink-muted">
        Click an empty slot to book it, or a booking to see or change it.
      </p>
      <BookingDialog
        request={dialogRequest}
        onClose={() => setDialogRequest(null)}
      />
    </div>
  );
}

const VISIBLE_HOURS_TEXT = `${formatHourLabel(DAY_VIEW_START_HOUR)}–${formatHourLabel(DAY_VIEW_END_HOUR)}`;

/** Names the one day the timeline shows, so it can't be read as a week. */
function DayHeading({ day, timezone }: { day: TZDate; timezone: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{formatLongDay(day)}</h2>
      <p className="text-sm text-ink-muted">
        {VISIBLE_HOURS_TEXT} · Times are studio time: {describeZone(timezone)}
      </p>
    </div>
  );
}
