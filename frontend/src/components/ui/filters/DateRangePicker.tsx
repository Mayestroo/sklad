'use client';

import { useTranslations } from 'next-intl';
import { Calendar, ChevronDown } from 'lucide-react';
import { customPeriod, formatPeriodRange, isPreset, periodRange, PERIOD_PRESETS } from '@/lib/list-filters';
import { usePopover } from './usePopover';
import { RangeCalendar } from './RangeCalendar';

/** "Shu oy", "Hammasi" or "01.11.2026 – 21.11.2026" for a period value. */
export function usePeriodLabel() {
  const t = useTranslations('fb');
  return (value: string) => (isPreset(value) ? t(`p_${value}`) : formatPeriodRange(value));
}

/**
 * The one period control: a button naming the chosen range, opening presets
 * (Bugun … Shu yil, Hammasi) next to a calendar for any other range.
 * Shows dd.mm.yyyy, weeks start Monday; no browser date inputs.
 */
export function DateRangePicker({ label, value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const t = useTranslations('fb');
  const name = label ?? t('period');
  const periodLabel = usePeriodLabel();
  const { open, setOpen, close, wrapRef, triggerRef, panelRef, alignRight } = usePopover();
  const { from, to } = periodRange(value);
  const set = value !== '';

  return (
    <div className="fb-pop-wrap" ref={wrapRef}>
      <button ref={triggerRef} type="button" className="fb-btn" data-active={set || undefined} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Calendar size={14} aria-hidden />
        <span className="fb-btn-name">
          {name}
          {set && <span aria-hidden>:</span>}
        </span>
        {set && <span className="fb-btn-value">{periodLabel(value)}</span>}
        <ChevronDown size={14} aria-hidden className="fb-chev" />
      </button>
      {open && (
        <div ref={panelRef} className="fb-pop fb-pop-period" role="dialog" aria-label={name} data-align={alignRight ? 'right' : undefined}>
          <PeriodPresets
            value={value}
            onChange={(v) => {
              onChange(v);
              close();
            }}
          />
          <RangeCalendar
            from={from}
            to={to}
            onComplete={(a, b) => {
              onChange(customPeriod(a, b));
              close();
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Preset buttons; also used in the phone filter sheet. */
export function PeriodPresets({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('fb');
  const custom = !isPreset(value);
  return (
    <div className="fb-presets" role="group" aria-label={t('presets')}>
      {PERIOD_PRESETS.map((p) => (
        <button key={p || 'all'} type="button" aria-pressed={value === p} className="fb-preset" onClick={() => onChange(p)}>
          {t(`p_${p}`)}
        </button>
      ))}
      {custom && (
        <span className="fb-preset" data-current>
          {formatPeriodRange(value)}
        </span>
      )}
    </div>
  );
}
