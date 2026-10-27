import { TZDate } from "@date-fns/tz";
import { addWeeks, startOfDay } from "date-fns";
import { useState } from "react";

import {
  DEFAULT_BOOKING_HOURS,
  DEFAULT_BOOKING_START_HOUR,
  DAYS_PER_WEEK,
} from "../config/constants";
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
  getWeekStart,
  pickDefaultStartTime,
} from "../features/studio/studioTime";
import { useStudioConfig } from "../features/studio/useStudioConfig";
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
    />
  );
}

function Schedule({
  timezone,
  timeStepMinutes,
}: {
  timezone: string;
  timeStepMinutes: number;
}) {
  const today = new TZDate(new Date(), timezone);
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

  const showWeekOffset = (weekOffset: number) => {
    setSelectedDay(new TZDate(addWeeks(selectedDay, weekOffset), timezone));
  };

  return (
    <div className="space-y-4">
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
      <p className="text-sm text-ink-muted">
        Times are studio time: {describeZone(timezone)}
      </p>
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
        <div className="rounded-xl border border-line bg-surface p-2">
          <DayTimeline
            day={selectedDay}
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
