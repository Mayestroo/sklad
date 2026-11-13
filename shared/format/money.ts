/**
 * The one money / quantity / percent formatter for display text (D8).
 *
 * Used by the frontend (through `frontend/src/lib/utils.ts`) and by the
 * backend wherever it writes amounts into human-readable text (error
 * messages). Display only: never use the result as a value, and never round
 * stored or transmitted amounts with it.
 *
 * Rules (local Uzbek/Russian convention):
 * - thousands grouped with a non-breaking space, decimal separator a comma:
 *   `1 234 567,89`;
 * - UZS: no decimals for a whole amount, two decimals when the amount has a
 *   fractional part (`8 000 UZS`, `8 000,50 UZS`);
 * - USD and every other currency: always two decimals (`8 000,00 USD`);
 * - quantities: only the decimals they need, at most three (`2,5`, `1 000`);
 * - a value that rounds to zero is shown without a minus sign.
 *
 * Why: the old format printed three fixed decimals with a dot (`8.000 UZS`),
 * which Uzbek and Russian readers take for eight thousand.
 */

/** Non-breaking space (U+00A0): thousands separator and gap before the code. */
export const GROUP_SEPARATOR = String.fromCharCode(0xa0);
export const DECIMAL_SEPARATOR = ',';

export interface NumberFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

function toFiniteNumber(value: number | string, caller: string): number {
  const numeric =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    throw new TypeError(
      `${caller}: value must be a finite number, received ${String(value)}`,
    );
  }
  return numeric;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/** Formats a number with the local separators; rounds half away from zero. */
export function formatNumber(
  value: number | string,
  options: NumberFormatOptions = {},
): string {
  const n = toFiniteNumber(value, 'formatNumber');
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = Math.max(
    options.maximumFractionDigits ?? 3,
    minimumFractionDigits,
  );

  // Intl does the rounding (on the decimal value, so 1.005 -> 1.01, unlike
  // toFixed) and never switches to exponent notation; the separators are
  // applied by hand so the output does not depend on the browser's or
  // Node's ICU locale data.
  const plain = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Math.abs(n));

  const [intPart, fracPart] = plain.split('.');
  const isZero = /^[0.]*$/.test(plain);
  const sign = n < 0 && !isZero ? '-' : '';
  const grouped = groupThousands(intPart);
  return fracPart
    ? `${sign}${grouped}${DECIMAL_SEPARATOR}${fracPart}`
    : `${sign}${grouped}`;
}

function hasFraction(n: number, digits: number): boolean {
  const scaled = Math.round(Math.abs(n) * 10 ** digits);
  return scaled % 10 ** digits !== 0;
}

/** Fraction digits an amount in `currency` is displayed with. */
export function moneyFractionDigits(amount: number, currency: string): number {
  if (currency.trim().toUpperCase() === 'UZS') {
    return hasFraction(amount, 2) ? 2 : 0;
  }
  return 2;
}

/** The number part of a money amount, without the currency code. */
export function formatAmount(amount: number | string, currency: string): string {
  const n = toFiniteNumber(amount, 'formatAmount');
  if (typeof currency !== 'string' || currency.trim() === '') {
    throw new TypeError(
      `formatAmount: currency must be a non-empty string, received ${String(currency)}`,
    );
  }
  const digits = moneyFractionDigits(n, currency);
  return formatNumber(n, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** A money amount with its ISO code: `1 234 567,89 USD`. */
export function formatMoney(amount: number | string, currency: string): string {
  const number = formatAmount(amount, currency);
  return `${number}${GROUP_SEPARATOR}${currency.trim().toUpperCase()}`;
}

/** A quantity with only the decimals it needs (at most three). */
export function formatQuantity(value: number | string): string {
  return formatNumber(toFiniteNumber(value, 'formatQuantity'), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

/** A percentage with a fixed number of decimals (default one): `12,5%`. */
export function formatPercent(value: number | string, fractionDigits = 1): string {
  const n = toFiniteNumber(value, 'formatPercent');
  return `${formatNumber(n, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

/**
 * A short label for chart axes: `1,5M`, `950K`, `2,1B`. Same thresholds and
 * suffixes the dashboard chart used before, with the local decimal comma.
 */
export function formatCompactNumber(value: number | string): string {
  const n = toFiniteNumber(value, 'formatCompactNumber');
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return `${formatNumber(n / 1_000_000_000, { maximumFractionDigits: 1 })}B`;
  }
  if (abs >= 1_000_000) {
    return `${formatNumber(n / 1_000_000, { maximumFractionDigits: 1 })}M`;
  }
  if (abs >= 1_000) {
    return `${formatNumber(n / 1_000, { maximumFractionDigits: 0 })}K`;
  }
  return formatNumber(n, { maximumFractionDigits: 0 });
}
