'use client';

/**
 * Redesign list kit: the building blocks every list page shares —
 * signal tiles that double as filters, quick filter chips, a period picker,
 * a "More filters" disclosure, a column chooser, active-filter pills and a
 * result line with per-currency totals (ADR 0023: never summed across currencies).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Columns3, SlidersHorizontal, X } from 'lucide-react';
import { DateRangeField } from '@/components/ui/DateRangeField';
import { quickPeriodRange } from '@/lib/date-range';
import { formatCurrency } from '@/lib/utils';
import type { CurrencyTotal } from '@/lib/currency-totals';

export type Tone = 'error' | 'warning' | 'success' | 'info' | 'neutral';

/* ─── Signal tiles ──────────────────────────────────────────────── */

export interface SignalProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  /** When given, the tile is a toggle button that applies a filter. */
  onClick?: () => void;
  active?: boolean;
}

export function Signal({ label, value, hint, tone = 'neutral', onClick, active }: SignalProps) {
  const body = (
    <>
      <span className="rd-signal-label">{label}</span>
      <span className="rd-signal-value">{value}</span>
      {hint && <span className="rd-signal-hint">{hint}</span>}
    </>
  );
  if (!onClick) return <div className={`rd-signal rd-tone-${tone}`}>{body}</div>;
  return (
    <button type="button" className={`rd-signal rd-tone-${tone}`} aria-pressed={Boolean(active)} onClick={onClick}>
      {body}
    </button>
  );
}

export function SignalStrip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="rd-signals" aria-label={label}>
      {children}
    </section>
  );
}

/* ─── Chips ─────────────────────────────────────────────────────── */

export interface ChipOption<V extends string = string> {
  value: V;
  label: string;
  count?: number;
}

/** Single-choice chips; clicking the active chip again clears it (back to `''`). */
export function ChipGroup<V extends string = string>({
  label,
  options,
  value,
  onChange,
  showLabel = false,
}: {
  label: string;
  options: ChipOption<V>[];
  value: V | '';
  onChange: (v: V | '') => void;
  showLabel?: boolean;
}) {
  return (
    <div className="rd-chips" role="group" aria-label={label}>
      {showLabel && <span className="rd-chips-label" aria-hidden>{label}</span>}
      {options.map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          className="rd-chip"
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value && o.value !== '' ? ('' as V | '') : o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="rd-chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ─── Period ────────────────────────────────────────────────────── */

export type PeriodKey = 'all' | 'today' | 'this_week' | 'this_month' | 'last_month' | 'custom';
export interface PeriodValue {
  key: PeriodKey;
  from: string;
  to: string;
}
export const ALL_TIME: PeriodValue = { key: 'all', from: '', to: '' };

/** The date range a remembered period means today ("this month" moves with the calendar). */
export function resolvePeriod(p: PeriodValue): { from: string; to: string } {
  if (p.key === 'all') return { from: '', to: '' };
  if (p.key === 'custom') return { from: p.from, to: p.to };
  const r = quickPeriodRange(p.key);
  return { from: r.date_from, to: r.date_to };
}

export function PeriodFilter({ value, onChange, locale }: { value: PeriodValue; onChange: (v: PeriodValue) => void; locale: 'uz' | 'ru' }) {
  const t = useTranslations('rd.list');
  const keys: PeriodKey[] = ['today', 'this_week', 'this_month', 'last_month', 'all', 'custom'];
  return (
    <div className="rd-chips" role="group" aria-label={t('period')}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className="rd-chip"
          aria-pressed={value.key === k}
          onClick={() => onChange(k === 'custom' ? { key: 'custom', from: value.from, to: value.to } : { key: k, from: '', to: '' })}
        >
          {t(`p_${k}`)}
        </button>
      ))}
      {value.key === 'custom' && (
        <DateRangeField
          label={t('period')}
          from={value.from}
          to={value.to}
          locale={locale}
          onChange={(from, to) => onChange({ key: 'custom', from, to })}
          style={{ minWidth: 230 }}
        />
      )}
    </div>
  );
}

/* ─── More filters disclosure ───────────────────────────────────── */

export function MoreFiltersButton({ open, onToggle, activeCount, controls }: { open: boolean; onToggle: () => void; activeCount: number; controls: string }) {
  const t = useTranslations('rd.list');
  return (
    <button type="button" className="rd-chip" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      <SlidersHorizontal size={14} aria-hidden />
      {t('moreFilters')}
      {activeCount > 0 && <span className="rd-chip-count">({activeCount})</span>}
      <ChevronDown size={14} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }} />
    </button>
  );
}

/* ─── Column chooser ────────────────────────────────────────────── */

export interface ColumnDef {
  key: string;
  label: string;
  /** Always shown (number, actions). */
  locked?: boolean;
}

export function ColumnChooser({ columns, hidden, onChange }: { columns: ColumnDef[]; hidden: string[]; onChange: (hidden: string[]) => void }) {
  const t = useTranslations('rd.list');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div className="rd-popover-wrap" ref={wrapRef}>
      <button type="button" className="rd-chip" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Columns3 size={14} aria-hidden /> {t('columns')}
      </button>
      {open && (
        <div className="rd-popover" id={id} role="group" aria-label={t('columns')}>
          {columns
            .filter((c) => !c.locked)
            .map((c) => (
              <label key={c.key}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(c.key)}
                  onChange={(e) => onChange(e.target.checked ? hidden.filter((h) => h !== c.key) : [...hidden, c.key])}
                />
                {c.label}
              </label>
            ))}
        </div>
      )}
    </div>
  );
}

/* ─── Active filter pills ───────────────────────────────────────── */

export interface ActiveFilter {
  key: string;
  label: string;
  onClear: () => void;
}

export function ActiveFilters({ items, onClearAll }: { items: ActiveFilter[]; onClearAll: () => void }) {
  const t = useTranslations('rd.list');
  if (items.length === 0) return null;
  return (
    <div className="rd-active-filters">
      <span>{t('filteredBy')}</span>
      {items.map((f) => (
        <span key={f.key} className="rd-active-filter">
          {f.label}
          <button type="button" onClick={f.onClear} aria-label={t('removeFilter', { name: f.label })}>
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <button type="button" className="rd-linkbtn" onClick={onClearAll}>
        {t('clearAll')}
      </button>
    </div>
  );
}

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
