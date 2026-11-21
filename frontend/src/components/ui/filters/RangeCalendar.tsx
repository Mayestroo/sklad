'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, monthGrid, todayIso } from '@/lib/list-filters';
import { formatDmy } from '@/lib/date-range';

/**
 * Month calendar for picking a range: first click = start, second = end (the same
 * day twice = one day). Weeks start on Monday. Keyboard: arrows move a day/week,
 * PageUp/PageDown a month, Home/End the week, Enter/Space picks.
 */
export function RangeCalendar({ from, to, onComplete, autoFocus }: { from: string; to: string; onComplete: (from: string, to: string) => void; autoFocus?: boolean }) {
  const t = useTranslations('fb');
  const months = t('months').split(',');
  const weekdays = t('weekdays').split(',');
  const weekdaysLong = t('weekdaysLong').split(',');
  const today = todayIso();
  const [start, setStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState(from || today);
  const view = { year: Number(focus.slice(0, 4)), month: Number(focus.slice(5, 7)) - 1 };
  const gridRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current && !autoFocus) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, autoFocus]);

  const shiftMonth = (delta: number) => {
    const d = new Date(view.year, view.month + delta, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const day = Math.min(Number(focus.slice(8, 10)), last);
    setFocus(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };

  const pick = (day: string) => {
    if (!start) {
      setStart(day);
      return;
    }
    const [a, b] = day < start ? [day, start] : [start, day];
    setStart(null);
    setHover(null);
    onComplete(a, b);
  };

  const shownFrom = start ? (hover && hover < start ? hover : start) : from;
  const shownTo = start ? (hover && hover > start ? hover : start) : to;
  const cells = monthGrid(view.year, view.month);
  const rows: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  while (rows[rows.length - 1].length < 7) rows[rows.length - 1].push(null);

  const onKey = (e: React.KeyboardEvent, day: string) => {
    const dow = (new Date(`${day}T00:00:00`).getDay() + 6) % 7;
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDays(day, -1),
      ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7),
      ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -dow),
      End: () => addDays(day, 6 - dow),
    };
    if (step[e.key]) {
      e.preventDefault();
      moved.current = true;
      setFocus(step[e.key]());
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      moved.current = true;
      shiftMonth(e.key === 'PageUp' ? -1 : 1);
    }
  };

  const title = `${months[view.month]} ${view.year}`;
  return (
    <div className="fb-cal">
      <div className="fb-cal-head">
        <button type="button" className="fb-icon-btn" aria-label={t('prevMonth')} title={t('prevMonth')} onClick={() => shiftMonth(-1)}>
          <ChevronLeft size={16} aria-hidden />
        </button>
        <strong aria-live="polite">{title}</strong>
        <button type="button" className="fb-icon-btn" aria-label={t('nextMonth')} title={t('nextMonth')} onClick={() => shiftMonth(1)}>
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
      <div ref={gridRef} role="grid" aria-label={title} className="fb-cal-grid" onMouseLeave={() => setHover(null)}>
        <div role="row" className="fb-cal-row">
          {weekdays.map((d, i) => (
            <span key={d} role="columnheader" className="fb-cal-dow" title={weekdaysLong[i]}>
              <abbr title={weekdaysLong[i]}>{d}</abbr>
            </span>
          ))}
        </div>
        {rows.map((row, r) => (
          <div key={r} role="row" className="fb-cal-row">
            {row.map((day, c) => {
              if (!day) return <span key={`e${c}`} role="gridcell" className="fb-cal-blank" />;
              const edge = day === shownFrom || day === shownTo;
              const inside = Boolean(shownFrom && shownTo && day > shownFrom && day < shownTo);
              return (
                <span key={day} role="gridcell" aria-selected={edge || inside}>
                  <button
                    type="button"
                    data-day={day}
                    tabIndex={day === focus ? 0 : -1}
                    className="fb-cal-day"
                    data-edge={edge || undefined}
                    data-inside={inside || undefined}
                    data-today={day === today || undefined}
                    aria-label={`${formatDmy(day)}${day === today ? `, ${t('today')}` : ''}`}
                    aria-pressed={edge}
                    onClick={() => {
                      setFocus(day);
                      pick(day);
                    }}
                    onMouseEnter={() => start && setHover(day)}
                    onFocus={() => start && setHover(day)}
                    onKeyDown={(e) => onKey(e, day)}
                  >
                    {Number(day.slice(8, 10))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="fb-cal-hint" aria-live="polite">
        {start ? `${formatDmy(start)} – … · ${t('pickEnd')}` : t('pickStart')}
      </p>
    </div>
  );
}
