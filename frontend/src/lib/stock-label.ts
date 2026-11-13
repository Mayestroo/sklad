/**
 * Stock shown next to a product in document dropdowns (muammolar.pdf B11).
 *
 * The number that matters for a sale is the free stock (physical minus
 * reserved) in the document's warehouse. A product stocked only in other
 * warehouses used to read "Qoldiq: 0" with no hint, or fell back to the
 * all-warehouse total when the selected warehouse had no row for it, so the
 * same label meant two different things.
 */
export function stockLabel(
  freeInWarehouse: number | undefined,
  totalAllWarehouses: number | undefined,
  locale: string,
): string {
  const isRu = locale === 'ru';
  const free = freeInWarehouse ?? 0;
  const total = totalAllWarehouses ?? 0;
  const head = `${isRu ? 'Свободно' : 'Qoldiq'}: ${free}`;
  if (total > free) {
    return `${head} (${isRu ? 'всего по складам' : 'barcha omborlarda'}: ${total})`;
  }
  return head;
}
