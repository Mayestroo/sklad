/**
 * An unpaid sales invoice or purchase receipt offered in the Finance
 * income/expense form. Picking one fills the amount with what is still owed
 * on it (the user may lower it for a partial payment).
 */
export interface OpenDocumentAmounts {
  totalAmount: number | string;
  paidAmount: number | string;
}

/** What is still owed on the document, rounded to cents; never negative. */
export function remainingOnDocument(document: OpenDocumentAmounts): number {
  const remaining = Number(document.totalAmount) - Number(document.paidAmount);
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  return Math.round((remaining + Number.EPSILON) * 100) / 100;
}

/** The amount field's text after picking a document ('' when nothing is owed). */
export function amountForPickedDocument(document: OpenDocumentAmounts | undefined): string {
  if (!document) return '';
  const remaining = remainingOnDocument(document);
  return remaining > 0 ? String(remaining) : '';
}
