'use client';

import { useRef } from 'react';
import type { FilterOption } from './types';

/**
 * The main way to slice a list (e.g. status): one row of segments, exactly one
 * chosen. A radio group: Tab enters at the chosen segment, arrows move and choose.
 */
export function SegmentedFilter({ label, options, value, onChange, name }: { label: string; options: FilterOption[]; value: string; onChange: (v: string) => void; name?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const move = (i: number) => {
    const n = (i + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div className="fb-seg" role="radiogroup" aria-label={label} data-name={name}>
      {options.map((o, i) => {
        const on = i === current;
        return (
          <button
            key={o.value || 'all'}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="fb-seg-item"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i + 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i - 1);
              } else if (e.key === 'Home') {
                e.preventDefault();
                move(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                move(options.length - 1);
              }
            }}
          >
            {o.label}
            {o.count !== undefined && <span className="fb-count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
