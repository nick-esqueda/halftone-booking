import { getCategoryStyle } from "../../config/constants";

const ALL_CATEGORIES = "all";
const ALL_CATEGORIES_LABEL = "All";

export function getFilterLabel(category: string): string {
  return category === ALL_CATEGORIES
    ? ALL_CATEGORIES_LABEL
    : getCategoryStyle(category).label;
}

export function isInCategory(
  itemCategory: string,
  selectedCategory: string,
): boolean {
  return (
    selectedCategory === ALL_CATEGORIES || itemCategory === selectedCategory
  );
}
