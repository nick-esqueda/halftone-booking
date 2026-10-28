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

export interface CategoryGroup<Row> {
  category: string;
  rows: Row[];
}

/** Groups rows by their item's category, keeping the order categories first appear in. */
export function groupByCategory<
  Row extends { equipment: { category: string } },
>(rows: Row[]): CategoryGroup<Row>[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const category = row.equipment.category;
    const groupRows = groups.get(category) ?? [];
    groupRows.push(row);
    groups.set(category, groupRows);
  }

  return Array.from(groups, ([category, groupRows]) => ({
    category,
    rows: groupRows,
  }));
}
