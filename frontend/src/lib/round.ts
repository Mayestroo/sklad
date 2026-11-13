/**
 * Rounds a computed value (not a display string) to `digits` decimals.
 *
 * Exactly `Number(value.toFixed(digits))`, which the forms used inline
 * before; kept here so components contain no ad-hoc number formatting
 * (money-format-scan.spec.ts) and the rounding rule lives in one place.
 */
export function roundTo(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
