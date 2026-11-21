'use client';

/**
 * List table used by the redesigned list pages: sticky header, sortable
 * columns, whole-row click (and Enter) to open a preview, hideable columns,
 * an optional sticky totals row, skeleton loading, and card rows on phones
 * (globals.css `app-table-stack`).
 */
import { useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { isInteractiveTarget, rowKeyOpen } from './ListKit';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  /** Enables sorting by this value. */
  sortValue?: (row: T) => string | number;
  /** Cell content of the totals row. */
  footer?: ReactNode;
  /** The row's title on phones (no label, bigger text). */
  primary?: boolean;
  /** Cannot be hidden with the column chooser. */
  locked?: boolean;
  width?: number | string;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  hidden = [],
  sort,
  onSortChange,
  onRowClick,
  selectedKey,
  loading,
  empty,
  footerLabel,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  hidden?: string[];
  sort?: SortState | null;
  onSortChange?: (s: SortState | null) => void;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  loading?: boolean;
  empty?: ReactNode;
  /** Label of the totals row (shown when any column has a footer). */
  footerLabel?: string;
  caption?: string;
}) {
  const t = useTranslations('rd.table');
  const visible = columns.filter((c) => c.locked || !hidden.includes(c.key));
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      return String(x).localeCompare(String(y));
    });
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, columns, sort]);

  if (loading) return <SkeletonRows rows={6} columns={Math.min(visible.length, 6)} />;
  if (rows.length === 0) return <>{empty}</>;

  const hasFooter = visible.some((c) => c.footer !== undefined);
  const cycle = (key: string) => {
    if (!onSortChange) return;
    if (!sort || sort.key !== key) onSortChange({ key, dir: 'asc' });
    else if (sort.dir === 'asc') onSortChange({ key, dir: 'desc' });
    else onSortChange(null);
  };

  return (
    <div className="rd-table-scroll">
      <table className="rd-table app-table-stack">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {visible.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined;
              return (
                <th key={c.key} scope="col" className={c.numeric ? 'rd-num' : undefined} aria-sort={ariaSort} style={c.width ? { width: c.width } : undefined}>
                  {c.sortValue && onSortChange ? (
                    <button type="button" className="rd-sort" onClick={() => cycle(c.key)} title={t('sortBy', { name: c.label })}>
                      {c.label}
                      {active ? (sort?.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />) : <ArrowUpDown size={12} aria-hidden style={{ opacity: 0.4 }} />}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            const open = onRowClick ? () => onRowClick(row) : undefined;
            return (
              <tr
                key={key}
                className={open ? 'rd-row' : undefined}
                tabIndex={open ? 0 : undefined}
                data-selected={selectedKey === key ? "true" : undefined}
                onClick={open ? (e) => !isInteractiveTarget(e) && open() : undefined}
                onKeyDown={open ? rowKeyOpen(open) : undefined}
              >
                {visible.map((c) => (
                  <td key={c.key} className={c.numeric ? 'rd-num' : undefined} data-label={c.primary ? undefined : c.label} data-primary={c.primary ? '' : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {hasFooter && (
          <tfoot>
            <tr>
              {visible.map((c, i) => (
                <td key={c.key} className={c.numeric ? 'rd-num' : undefined} data-label={c.footer !== undefined && i > 0 ? c.label : undefined}>
                  {i === 0 ? (c.footer ?? footerLabel) : c.footer}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
