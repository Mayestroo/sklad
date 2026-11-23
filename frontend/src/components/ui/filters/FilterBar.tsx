'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { SearchField } from '@/components/ui/SearchField';
import type { FilterValues } from '@/lib/list-filters';
import { ActiveFilterChips, type ActiveChip } from './ActiveFilterChips';
import { DateRangePicker, usePeriodLabel } from './DateRangePicker';
import { FilterDropdown } from './FilterDropdown';
import { FilterSheet } from './FilterSheet';
import { SegmentedFilter } from './SegmentedFilter';
import type { FilterDef, FilterOption } from './types';
import type { FilterState } from './useFilterState';

export interface FilterBarProps<F extends FilterValues> {
  state: FilterState<F>;
  defs: FilterDef[];
  /** What the search finds ("Raqam yoki mijoz"); omit when the list has no search. */
  searchPlaceholder?: string;
  /** Rows the page already received (or `total` of a paged answer). Shown while filtered. */
  resultCount?: number | null;
  /** The "Ustunlar" button (ColumnChooser), always last. */
  columns?: ReactNode;
  /** Accessible name of the toolbar ("Sotuvlar filtrlari"). */
  label?: string;
}

/** Search keeps at least this width on the filters' row; below it the filters move to their own line. */
const SEARCH_MIN = 240;
const PHONE_MAX = 640;

const isTyping = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  return Boolean(node && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)));
};

/**
 * The one filter toolbar of every list page, in this order: search ("/" focuses
 * it) · primary status as segments · secondary filters as dropdowns · period ·
 * columns. Under it: active filters as chips, "Tozalash", the result count.
 * Below 640 px: search + one "Filtrlar (n)" button opening a bottom sheet.
 */
export function FilterBar<F extends FilterValues>({ state, defs, searchPlaceholder, resultCount, columns, label }: FilterBarProps<F>) {
  const t = useTranslations('fb');
  const periodLabel = usePeriodLabel();
  const searchRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const { values, defaults, set } = state;

  useEffect(() => {
    if (!searchPlaceholder) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const input = searchRef.current;
      if (!input || input.offsetParent === null || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchPlaceholder]);

  // One row when search (at least SEARCH_MIN), every filter and Columns fit; otherwise search + Columns on
  // the first line and all filters together on the second. Filter widths are their natural widths, so the
  // choice does not change them and cannot flip back and forth.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const controls = row?.querySelector<HTMLElement>('.fb-controls');
    if (!row || !controls || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (window.innerWidth <= PHONE_MAX) return setStacked(false);
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const kids = Array.from(controls.children) as HTMLElement[];
      const filtersWidth = kids.reduce((w, k) => w + k.getBoundingClientRect().width, 0) + gap * Math.max(0, kids.length - 1);
      const cols = row.querySelector<HTMLElement>('.fb-columns');
      const need = (searchPlaceholder ? SEARCH_MIN + gap : 0) + filtersWidth + (cols ? cols.getBoundingClientRect().width + gap : 0);
      setStacked(need > row.clientWidth + 0.5);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    for (const k of Array.from(controls.children)) ro.observe(k);
    return () => ro.disconnect();
  }, [searchPlaceholder, defs.length]);

  const optionsOf = (d: FilterDef): FilterOption[] => {
    if (d.kind !== 'segmented' && d.kind !== 'select') return [];
    return d.noAll ? d.options : [{ value: '', label: d.kind === 'select' && d.allLabel ? d.allLabel : t('all') }, ...d.options];
  };
  const patch = (k: string, v: string) => set({ [k]: v } as Partial<F>);

  const chips: ActiveChip[] = [];
  if (state.debouncedSearch) chips.push({ key: 'q', label: t('searchChip', { q: state.debouncedSearch }), onRemove: () => state.setSearch('') });
  for (const d of defs) {
    const v = values[d.key] ?? '';
    if (v === (defaults[d.key] ?? '')) continue;
    const valueLabel = d.kind === 'toggle' ? '' : d.kind === 'period' ? periodLabel(v) : (optionsOf(d).find((o) => o.value === v)?.label ?? '…');
    chips.push({ key: d.key, label: valueLabel ? `${d.label}: ${valueLabel}` : d.label, onRemove: () => patch(d.key, defaults[d.key] ?? '') });
  }
  const clearAll = () => state.reset();
  const filterDefs = defs;

  return (
    <div className="fb" role="search" aria-label={label ?? t('filters')} data-stacked={stacked || undefined}>
      <div className="fb-row" ref={rowRef}>
        {searchPlaceholder && (
          <SearchField inputRef={searchRef} value={state.search} onChange={state.setSearch} placeholder={searchPlaceholder} label={t('search')} shortcut="/" className="fb-search" />
        )}
        <div className="fb-controls">
          {filterDefs.map((d) => {
            const v = values[d.key] ?? '';
            if (d.kind === 'segmented') return <SegmentedFilter key={d.key} name={d.key} label={d.label} options={optionsOf(d)} value={v} onChange={(nv) => patch(d.key, nv)} />;
            if (d.kind === 'select')
              return <FilterDropdown key={d.key} label={d.label} options={optionsOf(d)} value={v} searchable={d.searchable} allValue={d.noAll ? (defaults[d.key] ?? '') : ''} onChange={(nv) => patch(d.key, nv)} />;
            if (d.kind === 'period') return <DateRangePicker key={d.key} label={d.label} value={v} onChange={(nv) => patch(d.key, nv)} />;
            return (
              <button key={d.key} type="button" className="fb-btn" data-active={v !== '' || undefined} aria-pressed={v !== ''} onClick={() => patch(d.key, v ? '' : '1')}>
                {d.label}
              </button>
            );
          })}
        </div>
        {filterDefs.length > 0 && (
          <button type="button" className="fb-btn fb-mobile-only" data-active={state.activeCount > 0 || undefined} aria-label={t('filtersAria', { count: state.activeCount })} onClick={() => setSheetOpen(true)}>
            <SlidersHorizontal size={14} aria-hidden />
            <span aria-hidden>{t('filters')}</span>
            {state.activeCount > 0 && (
              <span className="fb-badge" aria-hidden>
                {state.activeCount}
              </span>
            )}
          </button>
        )}
        {columns && <div className="fb-columns">{columns}</div>}
      </div>
      <ActiveFilterChips chips={chips} onClearAll={clearAll} resultCount={resultCount} />
      {sheetOpen && <FilterSheet defs={filterDefs} optionsOf={optionsOf} values={values} defaults={defaults} onApply={(v) => set(v as Partial<F>)} onClose={closeSheet} />}
    </div>
  );
}
