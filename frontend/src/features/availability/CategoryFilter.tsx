import { CATEGORY_FILTERS } from "../../config/constants";
import { getFilterLabel } from "./categories";

interface CategoryFilterProps {
  selectedCategory: string;
  onChange: (category: string) => void;
}

export function CategoryFilter({
  selectedCategory,
  onChange,
}: CategoryFilterProps) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Filter by category"
    >
      {CATEGORY_FILTERS.map((category) => {
        const isSelected = category === selectedCategory;
        const stateClassName = isSelected
          ? "border-line-strong bg-muted text-ink"
          : "border-line-strong text-ink-muted hover:text-ink";
        return (
          <button
            key={category}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(category)}
            className={`rounded-full border px-3 py-1 text-xs ${stateClassName}`}
          >
            {getFilterLabel(category)}
          </button>
        );
      })}
    </div>
  );
}
