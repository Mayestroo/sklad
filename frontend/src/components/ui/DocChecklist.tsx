'use client';

/**
 * "Ready to post?" list in a document's side panel: each required thing with
 * a tick when done, so the user sees what is still missing before pressing
 * Post instead of after an error.
 */
import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle } from 'lucide-react';

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export function DocChecklist({ items }: { items: ChecklistItem[] }) {
  const t = useTranslations('rd.docForm');
  const missing = items.filter((i) => !i.done).length;
  return (
    <section className="doc-checklist" aria-labelledby="doc-checklist-title">
      <h3 id="doc-checklist-title">{missing === 0 ? t('readyToPost') : t('stillMissing', { count: missing })}</h3>
      <ul>
        {items.map((i) => (
          <li key={i.label} data-done={i.done ? 'true' : 'false'}>
            {i.done ? <CheckCircle2 size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
            <span>
              {i.label}
              <span className="sr-only">{i.done ? ` — ${t('done')}` : ` — ${t('notDone')}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Spreadsheet-like keys for a document's line table: Enter in a field moves to
 * the same field in the next row; in the last row it adds a row and puts the
 * cursor in its product picker. Attach to the <tbody>.
 */
export function linesKeyDown(opts: { rowCount: number; addRow: () => void; disabled?: boolean }) {
  return (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (opts.disabled || e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT') return;
    const cell = target.closest('td');
    const row = target.closest('tr');
    const body = e.currentTarget;
    if (!cell || !row) return;
    const rows = Array.from(body.querySelectorAll(':scope > tr'));
    const rowIndex = rows.indexOf(row);
    const colIndex = Array.from(row.children).indexOf(cell);
    e.preventDefault();
    if (rowIndex === rows.length - 1) {
      opts.addRow();
      // The new row renders on the next frame.
      window.requestAnimationFrame(() => {
        const last = body.querySelector(':scope > tr:last-child');
        (last?.querySelector('[role="combobox"]') as HTMLElement | null)?.focus();
      });
      return;
    }
    const next = rows[rowIndex + 1]?.children[colIndex];
    (next?.querySelector('input, [role="combobox"]') as HTMLElement | null)?.focus();
  };
}
