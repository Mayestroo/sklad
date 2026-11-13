/**
 * muammolar.pdf B13 ("Qo'shimcha xarajat bo'lishi kerak" under Sales).
 *
 * Reading taken: users want to record selling-side expenses (delivery to a
 * customer, loading, commissions) from the Sales section. Those are period
 * expenses, so the Sales menu entry opens Finance with a new expense
 * (`/finance?new=expense`) instead of the purchase "additional expenses"
 * screen, which is landed cost and would put selling costs into inventory.
 */
export type FinanceQuickAction = 'income' | 'expense' | 'transfer';

export const SALES_EXPENSE_HREF = '/finance?new=expense';

/** The drawer to open for a `?new=` value, or null for anything else. */
export function financeQuickAction(
  value: string | null | undefined,
): FinanceQuickAction | null {
  return value === 'income' || value === 'expense' || value === 'transfer'
    ? value
    : null;
}
