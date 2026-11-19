import { formatQuantity } from '../../../shared/format/money.ts';

/**
 * Units of measure are stored as codes ('piece', 'kg', 'liter', 'meter',
 * 'box', 'pack'); tenants may also type their own unit names. Screens show
 * the code in the user's language (muammolar.pdf B12: "piece" and "meter"
 * appeared in English). Custom units are shown as typed.
 */
const UNIT_LABELS: Record<string, { uz: string; ru: string }> = {
  piece: { uz: 'dona', ru: 'шт' },
  kg: { uz: 'kg', ru: 'кг' },
  liter: { uz: 'litr', ru: 'л' },
  meter: { uz: 'metr', ru: 'м' },
  box: { uz: 'quti', ru: 'кор' },
  pack: { uz: "to'plam", ru: 'упак' },
  // Entry-only sub-units (production recipes convert them to the card unit).
  g: { uz: 'gramm', ru: 'г' },
  ml: { uz: 'ml', ru: 'мл' },
  cm: { uz: 'sm', ru: 'см' },
  mm: { uz: 'mm', ru: 'мм' },
};

export function unitLabel(unit: string | null | undefined, locale: string): string {
  if (!unit) return locale === 'ru' ? UNIT_LABELS.piece.ru : UNIT_LABELS.piece.uz;
  const known = UNIT_LABELS[unit];
  if (!known) return unit;
  return locale === 'ru' ? known.ru : known.uz;
}

/**
 * A quantity as the user reads it: grouped number and its unit
 * ("1,250 kg", "3 dona"). A missing unit shows the number alone rather
 * than guessing pieces.
 */
export function quantityWithUnit(value: number | string | null | undefined, unit: string | null | undefined, locale: string): string {
  const number = formatQuantity(Number(value ?? 0));
  return unit ? `${number} ${unitLabel(unit, locale)}` : number;
}
