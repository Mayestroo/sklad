/**
 * Shared types — Translatable field type
 * Used for bilingual (UZ/RU) fields stored as JSONB in PostgreSQL
 */

/** A field that stores values in both Uzbek and Russian */
export interface TranslatableField {
  uz: string;
  ru: string;
}

/** Supported UI locales */
export type SupportedLocale = 'uz' | 'ru';

/** Extract localized value from a translatable field */
export function getLocalizedValue(
  field: TranslatableField,
  locale: SupportedLocale,
): string {
  return field[locale] || field.uz || field.ru || '';
}
