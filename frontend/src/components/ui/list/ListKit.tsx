'use client';

/**
 * List helpers shared by DataTable and the list pages: the per-currency totals
 * line (ADR 0023: never summed across currencies) and row keyboard/click rules.
 * Filters live in components/ui/filters (FilterBar), key numbers in
 * components/ui/stats (StatCard).
 */
import { formatCurrency } from '@/lib/utils';
import type { CurrencyTotal } from '@/lib/currency-totals';

/* ─── Totals line ───────────────────────────────────────────────── */

export function CurrencyTotals({ totals, locale }: { totals: CurrencyTotal[]; locale: string }) {
  if (totals.length === 0) return <span className="tabular-nums">—</span>;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }} className="tabular-nums">
      {totals.map((x) => (
        <span key={x.currency}>{formatCurrency(x.amount, locale, x.currency)}</span>
      ))}
    </span>
  );
}

/** Enter/Space on a focused row opens it — the keyboard twin of clicking the row. */
export function rowKeyOpen(open: () => void) {
  return (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };
}

/** Clicks on buttons/links inside a row do their own thing, not "open the row". */
export function isInteractiveTarget(e: React.MouseEvent): boolean {
  return Boolean((e.target as HTMLElement).closest('button, a, input, select, label, [role="menu"]'));
}
