'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { FilterValues } from '@/lib/list-filters';
import { customPeriod, periodRange } from '@/lib/list-filters';
import { PeriodPresets } from './DateRangePicker';
import { RangeCalendar } from './RangeCalendar';
import type { FilterDef, FilterOption } from './types';

/**
 * Phone filters: a bottom sheet with every filter of the page. Changes are a
 * draft until "Qo'llash"; "Tozalash" resets the draft to the defaults; Esc,
 * the close button or the backdrop discard it. Focus stays inside while open.
 */
export function FilterSheet({
  defs,
  optionsOf,
  values,
  defaults,
  onApply,
  onClose,
}: {
  defs: FilterDef[];
  optionsOf: (d: FilterDef) => FilterOption[];
  values: FilterValues;
  defaults: FilterValues;
  onApply: (v: FilterValues) => void;
  onClose: () => void;
}) {
  const t = useTranslations('fb');
  const id = useId();
  const [draft, setDraft] = useState<FilterValues>(values);
  const [queries, setQueries] = useState<Record<string, string>>({});
  const sheetRef = useRef<HTMLDivElement>(null);
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheetRef.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="fb-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheetRef} className="fb-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="fb-sheet-head">
          <h2 id={`${id}-title`}>{t('filters')}</h2>
          <button type="button" className="fb-icon-btn" aria-label={t('close')} title={t('close')} onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="fb-sheet-body">
          {defs.map((d) => {
            const v = draft[d.key] ?? '';
            if (d.kind === 'toggle')
              return (
                <label key={d.key} className="fb-sheet-toggle">
                  <input type="checkbox" checked={v !== ''} onChange={(e) => set(d.key, e.target.checked ? '1' : '')} />
                  {d.label}
                </label>
              );
            if (d.kind === 'period') {
              const { from, to } = periodRange(v);
              return (
                <fieldset key={d.key} className="fb-sheet-group">
                  <legend>{d.label}</legend>
                  <PeriodPresets value={v} onChange={(p) => set(d.key, p)} />
                  <RangeCalendar from={from} to={to} onComplete={(a, b) => set(d.key, customPeriod(a, b))} />
                </fieldset>
              );
            }
            const options = optionsOf(d);
            const q = (queries[d.key] ?? '').trim().toLowerCase();
            const long = d.kind === 'select' && (d.searchable || options.length > 8);
            const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
            return (
              <fieldset key={d.key} className="fb-sheet-group">
                <legend>{d.label}</legend>
                {long && (
                  <input
                    type="search"
                    className="fb-sheet-search"
                    aria-label={`${d.label}: ${t('searchOptions')}`}
                    placeholder={t('searchOptions')}
                    value={queries[d.key] ?? ''}
                    onChange={(e) => setQueries((s) => ({ ...s, [d.key]: e.target.value }))}
                  />
                )}
                <div className={long ? 'fb-sheet-options is-long' : 'fb-sheet-options'}>
                  {shown.length === 0 && <span className="fb-list-empty">{t('noOptions')}</span>}
                  {shown.map((o) => (
                    <label key={o.value || 'all'} className="fb-sheet-option">
                      <input type="radio" name={`${id}-${d.key}`} checked={v === o.value} onChange={() => set(d.key, o.value)} />
                      <span>{o.label}</span>
                      {o.count !== undefined && <span className="fb-count">{o.count}</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        <div className="fb-sheet-foot">
          <button type="button" className="fb-sheet-btn" onClick={() => setDraft(defaults)}>
            {t('clearAll')}
          </button>
          <button
            type="button"
            className="fb-sheet-btn is-primary"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {t('apply')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
