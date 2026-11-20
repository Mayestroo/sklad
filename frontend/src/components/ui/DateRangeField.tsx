'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatDmy, formatRange, maskDmy, orderedRange, parseDmy } from '@/lib/date-range';

export interface DateRangeFieldProps {
  label: string;
  /** ISO 'YYYY-MM-DD' or ''. */
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  locale: 'uz' | 'ru';
  style?: React.CSSProperties;
}

const MONTHS = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
};
const DAYS = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * One date-range field (TZ "Ishlab chiqarish" 11.5, 11.6): shows
 * "dd.MM.yyyy – dd.MM.yyyy"; opens a panel where both ends are typed
 * (dots are added) or picked on a calendar — first click the start, then
 * the end. Esc closes, focus returns to the field.
 */
export function DateRangeField({ label, from, to, onChange, locale, style }: DateRangeFieldProps) {
  const isRu = locale === 'ru';
  const id = useId();
  const [open, setOpen] = useState(false);
  // Typed text; when the value changes from outside, it shows that value again.
  const [draft, setDraft] = useState({ from, to, fromText: formatDmy(from), toText: formatDmy(to) });
  const text$ = draft.from === from && draft.to === to ? draft : { from, to, fromText: formatDmy(from), toText: formatDmy(to) };
  const [picking, setPicking] = useState<'from' | 'to'>('from');
  const base = from ? new Date(`${from}T00:00:00`) : new Date();
  const [view, setView] = useState({ year: base.getFullYear(), month: base.getMonth() });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const commit = (nextFrom: string, nextTo: string) => {
    const [a, b] = orderedRange(nextFrom, nextTo);
    onChange(a, b);
  };

  const pick = (day: string) => {
    if (picking === 'from') {
      commit(day, to && to >= day ? to : '');
      setPicking('to');
    } else {
      commit(from, day);
      setPicking('from');
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const text = formatRange(from, to);
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const lead = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const shift = (delta: number) =>
    setView((v) => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });

  const field: React.CSSProperties = { width: '100%', minHeight: 40, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' };

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{ ...field, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <Calendar size={15} aria-hidden style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          <span style={{ color: text ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {text || (isRu ? 'дд.мм.гггг – дд.мм.гггг' : 'kk.oo.yyyy – kk.oo.yyyy')}
          </span>
        </button>
        {(from || to) && (
          <button
            type="button"
            aria-label={isRu ? 'Очистить даты' : 'Sanalarni tozalash'}
            title={isRu ? 'Очистить даты' : 'Sanalarni tozalash'}
            onClick={() => commit('', '')}
            style={{ width: 40, height: 40, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', borderRadius: 'var(--radius-md)' }}
          >
            <X size={15} aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          style={{ position: 'absolute', zIndex: 1100, top: '100%', left: 0, marginTop: 4, width: 300, maxWidth: 'calc(100vw - 32px)', padding: 12, borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', boxShadow: 'var(--shadow-xl)' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {(['from', 'to'] as const).map((side) => (
              <label key={side} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {side === 'from' ? (isRu ? 'С' : 'Boshlanish') : isRu ? 'По' : 'Tugash'}
                <input
                  inputMode="numeric"
                  placeholder={isRu ? 'дд.мм.гггг' : 'kk.oo.yyyy'}
                  value={side === 'from' ? text$.fromText : text$.toText}
                  onFocus={() => setPicking(side)}
                  onChange={(e) => {
                    const masked = maskDmy(e.target.value);
                    setDraft({ ...text$, ...(side === 'from' ? { fromText: masked } : { toText: masked }) });
                    const parsed = parseDmy(masked);
                    if (parsed) commit(side === 'from' ? parsed : from, side === 'to' ? parsed : to);
                    else if (masked === '') commit(side === 'from' ? '' : from, side === 'to' ? '' : to);
                  }}
                  style={{ ...field, marginTop: 4, outline: picking === side ? '2px solid var(--color-primary-500)' : undefined }}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <button type="button" aria-label={isRu ? 'Предыдущий месяц' : 'Oldingi oy'} title={isRu ? 'Предыдущий месяц' : 'Oldingi oy'} onClick={() => shift(-1)} style={navButton}>
              <ChevronLeft size={16} aria-hidden />
            </button>
            <strong style={{ fontSize: 'var(--text-sm)' }}>
              {MONTHS[locale][view.month]} {view.year}
            </strong>
            <button type="button" aria-label={isRu ? 'Следующий месяц' : 'Keyingi oy'} title={isRu ? 'Следующий месяц' : 'Keyingi oy'} onClick={() => shift(1)} style={navButton}>
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div role="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
            {DAYS[locale].map((d) => (
              <div key={d} role="columnheader" style={{ fontSize: 11, color: 'var(--color-text-secondary)', padding: 4 }}>
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />;
              const value = iso(view.year, view.month, day);
              const edge = value === from || value === to;
              const inside = from && to && value > from && value < to;
              return (
                <button
                  key={value}
                  type="button"
                  role="gridcell"
                  aria-selected={edge}
                  aria-label={formatDmy(value)}
                  onClick={() => pick(value)}
                  style={{ height: 36, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-sm)', background: edge ? 'var(--color-primary-600)' : inside ? 'var(--color-primary-50)' : 'transparent', color: edge ? '#fff' : 'var(--color-text-primary)' }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 8 }}>
            {picking === 'from' ? (isRu ? 'Выберите дату начала' : 'Boshlanish sanasini tanlang') : isRu ? 'Выберите дату окончания' : 'Tugash sanasini tanlang'}
          </div>
        </div>
      )}
    </div>
  );
}

const navButton: React.CSSProperties = {
  width: 36,
  height: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: 'var(--color-text-secondary)',
  borderRadius: 'var(--radius-md)',
};
