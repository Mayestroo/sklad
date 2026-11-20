export function getInitialActiveOptionIndex(selectedIndex: number, optionCount: number): number {
  if (optionCount === 0) return -1;
  return selectedIndex >= 0 && selectedIndex < optionCount ? selectedIndex : 0;
}

export function getNextActiveOptionIndex(
  currentIndex: number,
  direction: -1 | 1,
  optionCount: number,
): number {
  if (optionCount === 0) return -1;
  return Math.max(0, Math.min(currentIndex + direction, optionCount - 1));
}

/** Lists longer than this render only the visible rows (TZ "Ishlab chiqarish" 11.5). */
export const VIRTUAL_THRESHOLD = 100;
/** Fixed row height of a virtual list (label + description). */
export const VIRTUAL_ROW_HEIGHT = 52;

/** Rows to render for a scroll position: [start, end) plus a few above and below. */
export function virtualWindow(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan = 4,
): { start: number; end: number } {
  if (count <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count, first + visible + overscan),
  };
}

/** The scrollTop that brings row `index` into view (unchanged when it already is). */
export function scrollTopForRow(index: number, scrollTop: number, viewportHeight: number, rowHeight: number): number {
  const top = index * rowHeight;
  if (top < scrollTop) return top;
  if (top + rowHeight > scrollTop + viewportHeight) return top + rowHeight - viewportHeight;
  return scrollTop;
}
