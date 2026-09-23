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
