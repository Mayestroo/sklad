/**
 * The bilingual name to save when a product is edited with a single name
 * field: the typed text replaces the name in the user's language and the
 * other language's name is kept. A product that had no name in the other
 * language (or a plain-string legacy name) gets the typed text in both.
 */
export function editedProductName(
  existing: string | { uz?: string; ru?: string } | null | undefined,
  locale: 'uz' | 'ru',
  typed: string,
): { uz: string; ru: string } {
  const other = locale === 'uz' ? 'ru' : 'uz';
  const kept = typeof existing === 'object' && existing ? existing[other]?.trim() : '';
  const result = { uz: typed, ru: typed };
  result[other] = kept || typed;
  return result;
}
