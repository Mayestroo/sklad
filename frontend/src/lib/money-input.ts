/**
 * Reading what a person types into a money / quantity field.
 *
 * The app shows numbers one way everywhere (shared/format/money.ts, D8):
 * non-breaking-space groups and a comma decimal — `15 000,5`. Inputs now show
 * the same text, and accept both typing habits:
 *
 * - spaces (any kind) are group separators;
 * - with both `.` and `,` the LAST one is the decimal separator
 *   (`15,000.5` and `15.000,5` are both 15000.5);
 * - the same separator repeated is grouping (`1,000,000`, `1.000.000`),
 *   unless the last group is not three digits (`1.000,5` aside: `1,000,5` → 1000.5);
 * - a single separator is the decimal (`1,5`, `12.75`, `15,`) — except
 *   exactly three digits after it (`15,000`, `1.500`), which can mean either.
 *   That case is reported as `ambiguous` and the caller decides explicitly
 *   (see `CurrencyInput`): typed digit by digit it is a decimal being typed;
 *   pasted it is read as thousands and the person is told so.
 * - a field with fewer than three decimals cannot hold `,000` decimals, so
 *   three digits after a single separator are grouping there (not ambiguous);
 *   a field with no decimals treats every separator as grouping.
 *
 * Only digits are kept (no sign), as before. The value is a plain number;
 * nothing here changes what is sent to the API.
 */

export const INPUT_GROUP = ' ';
export const INPUT_DECIMAL = ',';

export type MoneyReading = 'plain' | 'decimal' | 'grouped' | 'ambiguous';

export interface ParsedMoneyInput {
  /** Text to show in the field (`15 000,5`; keeps a trailing `,` while typing). */
  text: string;
  /** The number, or null when nothing was typed. */
  value: number | null;
  /** How separators were read. */
  reading: MoneyReading;
}

const groupDigits = (digits: string) => digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, INPUT_GROUP);

function build(intDigits: string, decDigits: string | null, maxDecimals: number, reading: MoneyReading): ParsedMoneyInput {
  const dec = decDigits === null ? null : decDigits.slice(0, Math.max(0, maxDecimals));
  if (!intDigits && (dec === null || dec === '')) {
    // "," alone → "0,"; nothing at all → empty
    if (dec === '' && maxDecimals > 0) return { text: `0${INPUT_DECIMAL}`, value: 0, reading };
    return { text: '', value: null, reading };
  }
  const int = intDigits ? groupDigits(intDigits) : '0';
  const showDec = dec !== null && maxDecimals > 0;
  const text = showDec ? `${int}${INPUT_DECIMAL}${dec}` : int;
  const value = Number(`${intDigits || '0'}${showDec && dec ? `.${dec}` : ''}`);
  return { text, value, reading };
}

/**
 * @param raw what is in the field
 * @param maxDecimals decimals the field allows (0 = whole numbers)
 * @param ambiguousAs how to read `15,000`-like input: 'decimal' (default) or 'grouped'
 */
export function parseMoneyInput(raw: string, maxDecimals: number, ambiguousAs: 'decimal' | 'grouped' = 'decimal'): ParsedMoneyInput {
  const cleaned = (raw ?? '').replace(/[\s   ]/g, '').replace(/[^0-9.,]/g, '');
  if (!cleaned) return { text: '', value: null, reading: 'plain' };

  const seps = cleaned.match(/[.,]/g) ?? [];
  const digitsOnly = cleaned.replace(/[.,]/g, '');
  if (seps.length === 0) return build(digitsOnly, null, maxDecimals, 'plain');
  if (maxDecimals <= 0) return build(digitsOnly, null, maxDecimals, 'grouped');

  const lastIdx = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  const before = cleaned.slice(0, lastIdx).replace(/[.,]/g, '');
  const after = cleaned.slice(lastIdx + 1);

  const kinds = new Set(seps);
  if (kinds.size === 2) return build(before, after, maxDecimals, 'decimal');

  if (seps.length > 1) {
    // 1,000,000 → grouping; 1,000,5 → last one is the decimal
    const groups = cleaned.split(/[.,]/).slice(1);
    if (groups.every((g) => g.length === 3)) return build(digitsOnly, null, maxDecimals, 'grouped');
    return build(before, after, maxDecimals, 'decimal');
  }

  // a single separator
  if (after.length === 3 && before.length > 0) {
    if (maxDecimals < 3) return build(digitsOnly, null, maxDecimals, 'grouped');
    return ambiguousAs === 'grouped' ? build(digitsOnly, null, maxDecimals, 'ambiguous') : build(before, after, maxDecimals, 'ambiguous');
  }
  return build(before, after, maxDecimals, 'decimal');
}

/** Field text for a stored number: `15 000,5` (no trailing zeros, at most `decimals` places). */
export function formatMoneyInput(val: number | string | null | undefined, decimals = 3): string {
  if (val === '' || val === null || val === undefined) return '';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  if (!Number.isFinite(num)) return '0';
  const fixed = Math.abs(num).toFixed(Math.max(0, decimals));
  const [int, frac = ''] = fixed.split('.');
  const dec = frac.replace(/0+$/, '');
  const sign = num < 0 && (Number(int) > 0 || dec) ? '-' : '';
  return `${sign}${groupDigits(int)}${dec ? `${INPUT_DECIMAL}${dec}` : ''}`;
}
