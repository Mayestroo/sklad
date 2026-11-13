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
};

export function unitLabel(unit: string | null | undefined, locale: string): string {
  if (!unit) return locale === 'ru' ? UNIT_LABELS.piece.ru : UNIT_LABELS.piece.uz;
  const known = UNIT_LABELS[unit];
  if (!known) return unit;
  return locale === 'ru' ? known.ru : known.uz;
}
