/** UI settings and labels. Studio rules (time zone, step) come from the API. */

export const NAME_STORAGE_KEY = "halftone-booking:booker-name";
export const THEME_STORAGE_KEY = "halftone-booking:theme";

// The day timeline shows these hours, in studio time.
export const DAY_VIEW_START_HOUR = 7;
export const DAY_VIEW_END_HOUR = 22;
export const HOUR_ROW_HEIGHT_PX = 48;

export const DAYS_PER_WEEK = 7;

// Default length of a booking started by clicking an empty slot.
export const DEFAULT_BOOKING_HOURS = 2;
export const DEFAULT_BOOKING_START_HOUR = 9;

export interface CategoryStyle {
  label: string;
  dotClassName: string;
}

const FALLBACK_CATEGORY: CategoryStyle = {
  label: "Other",
  dotClassName: "bg-gray-400",
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  camera: { label: "Cameras", dotClassName: "bg-orange-500" },
  lighting: { label: "Lighting", dotClassName: "bg-emerald-500" },
  room: { label: "Rooms", dotClassName: "bg-violet-400" },
};

export function getCategoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLES[category] ?? FALLBACK_CATEGORY;
}

export const CATEGORY_FILTERS = ["all", ...Object.keys(CATEGORY_STYLES)];
