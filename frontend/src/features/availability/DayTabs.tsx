import type { TZDate } from "@date-fns/tz";
import { isSameDay } from "date-fns";

import { Button } from "../../components/ui/Button";
import { formatDayOfMonth, formatWeekday } from "../studio/studioTime";

interface DayTabsProps {
  days: TZDate[];
  selectedDay: TZDate;
  today: Date;
  onSelectDay: (day: TZDate) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

export function DayTabs({
  days,
  selectedDay,
  today,
  onSelectDay,
  onPreviousWeek,
  onNextWeek,
  onToday,
}: DayTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="ghost"
        aria-label="Previous week"
        onClick={onPreviousWeek}
      >
        ‹
      </Button>
      <div role="tablist" aria-label="Day" className="flex">
        {days.map((day) => (
          <DayTab
            key={day.toISOString()}
            day={day}
            isSelected={isSameDay(day, selectedDay)}
            isToday={isSameDay(day, today)}
            onSelect={() => onSelectDay(day)}
          />
        ))}
      </div>
      <Button variant="ghost" aria-label="Next week" onClick={onNextWeek}>
        ›
      </Button>
      <Button onClick={onToday}>Today</Button>
    </div>
  );
}

// A fixed width per tab, so the week arrows stay put whatever the dates
// are and whichever tab is bold.
// On phones the weekday sits above the date to fit the narrower tab.
const DAY_TAB_CLASS_NAME =
  "flex w-10 shrink-0 flex-col items-center border-b-2 py-2 text-sm sm:w-20 sm:flex-row sm:justify-center sm:gap-1";

interface DayTabProps {
  day: TZDate;
  isSelected: boolean;
  isToday: boolean;
  onSelect: () => void;
}

function DayTab({ day, isSelected, isToday, onSelect }: DayTabProps) {
  const selectedClassName = isSelected
    ? "border-accent font-semibold text-ink"
    : "border-transparent text-ink-muted hover:text-ink";
  const todayMarker = isToday ? " •" : "";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onSelect}
      className={`${DAY_TAB_CLASS_NAME} ${selectedClassName}`}
    >
      <span>{formatWeekday(day)}</span>{" "}
      <span>
        {formatDayOfMonth(day)}
        {todayMarker}
      </span>
    </button>
  );
}
