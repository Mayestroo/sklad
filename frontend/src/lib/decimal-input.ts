/**
 * Typing numbers the local way (TZ "Ishlab chiqarish" 11.5): thousands are
 * grouped automatically with a space, the decimal separator is a comma
 * (a dot typed on the numpad becomes a comma), negative values cannot be
 * typed. The value handed to the form is canonical: '1234.5'.
 */

const NBSP = ' ';

/** '1234.5' / 1234.5 → '1 234,5' ('' stays ''). */
export function formatDecimalText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const canonical = String(value).replace(',', '.');
  const [intPart, fracPart] = canonical.split('.');
  const digits = intPart.replace(/\D/g, '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return fracPart !== undefined ? `${grouped || '0'},${fracPart}` : grouped;
}

/**
 * What the user typed → { text to show, canonical value }. Keeps at most
 * `decimals` decimals; drops anything that is not a digit or the first
 * decimal separator (so a minus sign cannot be typed).
 */
export function sanitizeDecimalText(raw: string, decimals = 3): { text: string; value: string } {
  let seenSeparator = false;
  let intPart = '';
  let fracPart = '';
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      if (seenSeparator) {
        if (fracPart.length < decimals) fracPart += ch;
      } else intPart += ch;
    } else if ((ch === ',' || ch === '.') && !seenSeparator && decimals > 0) {
      seenSeparator = true;
    }
  }
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const value = seenSeparator ? `${intPart || '0'}.${fracPart}` : intPart;
  const text = seenSeparator ? `${formatDecimalText(intPart || '0')},${fracPart}` : formatDecimalText(intPart);
  return { text, value: value.endsWith('.') ? value.slice(0, -1) : value };
}

/** Caret position in `text` after the same number of digits/commas as before. */
export function caretAfterSignificant(text: string, significantBefore: number): number {
  if (significantBefore <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/[\d,]/.test(text[i])) seen++;
    if (seen === significantBefore) return i + 1;
  }
  return text.length;
}
