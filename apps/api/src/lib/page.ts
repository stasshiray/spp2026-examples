export type Page<T> = {
  items: T[];
  nextCursor: number | null;
};

export function pageAfterLimit<T>(
  rows: T[],
  limit: number,
  cursorOf: (item: T) => number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: hasMore && last ? cursorOf(last) : null,
  };
}
