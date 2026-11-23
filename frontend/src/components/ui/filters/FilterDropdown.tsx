'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Search } from 'lucide-react';
import { usePopover } from './usePopover';
import type { FilterOption } from './types';

/**
 * A secondary filter as a compact button that names its value
 * ("To'lov: To'lanmagan"); at "Hammasi" it shows only the filter name.
 * Opens a listbox: arrows/Home/End move, Enter or Space chooses, Esc closes,
 * typing in the search box (long lists) narrows the options.
 */
export function FilterDropdown({
  label,
  options,
  value,
  onChange,
  searchable,
  allValue = '',
}: {
  label: string;
  /** Includes the "Hammasi" option when the filter has one. */
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
  searchable?: boolean;
  /** Value meaning "no filter" (shown as the bare name). */
  allValue?: string | null;
}) {
  const t = useTranslations('fb');
  const { open, setOpen, close, wrapRef, triggerRef, panelRef, alignRight } = usePopover();
  const listId = useId();
  const [query, setQuery] = useState('');
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const isSet = allValue === null ? true : value !== allValue;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const focusOption = (i: number) => {
    const n = Math.max(0, Math.min(visible.length - 1, i));
    optionRefs.current[n]?.focus();
  };
  const openList = () => {
    setQuery('');
    setOpen(true);
    requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus();
      else focusOption(Math.max(0, options.findIndex((o) => o.value === value)));
    });
  };
  const choose = (v: string) => {
    onChange(v);
    close();
  };

  return (
    <div className="fb-pop-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="fb-btn"
        data-active={isSet || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openList();
          }
        }}
      >
        <span className="fb-btn-name">
          {label}
          {isSet && selected && <span aria-hidden>:</span>}
        </span>
        {isSet && selected && <span className="fb-btn-value">{selected.label}</span>}
        <ChevronDown size={14} aria-hidden className="fb-chev" />
      </button>
      {open && (
        <div ref={panelRef} className="fb-pop" data-align={alignRight ? 'right' : undefined}>
          {searchable && (
            <div className="fb-pop-search">
              <Search size={14} aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                aria-label={t('searchOptions')}
                placeholder={t('searchOptions')}
                aria-controls={listId}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    focusOption(0);
                  } else if (e.key === 'Enter' && visible.length > 0) {
                    e.preventDefault();
                    choose(visible[0].value);
                  }
                }}
              />
            </div>
          )}
          <ul id={listId} role="listbox" aria-label={label} className="fb-list">
            {visible.length === 0 && <li className="fb-list-empty">{t('noOptions')}</li>}
            {visible.map((o, i) => {
              const on = o.value === value;
              return (
                <li
                  key={o.value || 'all'}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  role="option"
                  aria-selected={on}
                  tabIndex={-1}
                  className="fb-option"
                  onClick={() => choose(o.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      focusOption(i + 1);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (i === 0 && searchable) searchRef.current?.focus();
                      else focusOption(i - 1);
                    } else if (e.key === 'Home') {
                      e.preventDefault();
                      focusOption(0);
                    } else if (e.key === 'End') {
                      e.preventDefault();
                      focusOption(visible.length - 1);
                    } else if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      choose(o.value);
                    } else if (e.key === 'Tab') {
                      close(false);
                    }
                  }}
                >
                  <span>{o.label}</span>
                  {o.count !== undefined && <span className="fb-count">{o.count}</span>}
                  {on && <Check size={14} aria-hidden className="fb-check" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
