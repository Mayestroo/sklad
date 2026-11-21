'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Columns3 } from 'lucide-react';
import { usePopover } from './usePopover';

export interface ColumnDef {
  key: string;
  label: string;
  /** Always shown (number, actions). */
  locked?: boolean;
}

/** "Ustunlar": show or hide table columns; the last button of the FilterBar. */
export function ColumnChooser({ columns, hidden, onChange }: { columns: ColumnDef[]; hidden: string[]; onChange: (hidden: string[]) => void }) {
  const t = useTranslations('fb');
  const { open, setOpen, wrapRef, triggerRef, panelRef } = usePopover();
  const id = useId();
  return (
    <div className="fb-pop-wrap" ref={wrapRef}>
      <button ref={triggerRef} type="button" className="fb-btn" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
        <Columns3 size={14} aria-hidden /> {t('columns')}
      </button>
      {open && (
        <div ref={panelRef} className="fb-pop fb-pop-columns" id={id} role="group" aria-label={t('columns')} data-align="right">
          {columns
            .filter((c) => !c.locked)
            .map((c) => (
              <label key={c.key}>
                <input type="checkbox" checked={!hidden.includes(c.key)} onChange={(e) => onChange(e.target.checked ? hidden.filter((h) => h !== c.key) : [...hidden, c.key])} />
                {c.label}
              </label>
            ))}
        </div>
      )}
    </div>
  );
}
