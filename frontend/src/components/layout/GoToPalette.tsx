'use client';

import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Modal } from '@/components/ui/Modal';
import { allNavLeaves, normalizeSearch, NAV_SECTIONS, isNavGroup, type NavLeaf } from '@/lib/navigation';
import { NAV_ICONS } from './Sidebar';

interface PaletteEntry {
  key: string;
  label: string;
  hint?: string;
  href: string;
  kind: 'action' | 'page';
  icon?: NavLeaf['icon'];
  haystack: string;
}

const QUICK_ACTIONS: Array<{ label: string; href: string; keywords: string }> = [
  { label: 'actionNewSale', href: '/sales/new', keywords: 'sotuv faktura продажа счет new yangi новый' },
  { label: 'actionNewOrder', href: '/sales/orders/new', keywords: 'buyurtma zakaz заказ yangi новый' },
  { label: 'actionNewReceipt', href: '/purchases/new', keywords: 'kirim xarid приход закупка yangi новый' },
  { label: 'actionNewExpense', href: '/purchases/expenses/new', keywords: 'xarajat расход yangi новый' },
  { label: 'actionNewProduct', href: '/products/new', keywords: 'tovar mahsulot товар yangi новый' },
  { label: 'actionNewPurchaseReturn', href: '/purchases/returns/new', keywords: 'qaytarish возврат поставщик' },
];

/** "Go to" palette: jump to any section or start a frequent document (Ctrl+K). */
export function GoToPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <PaletteBody onClose={onClose} />;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const t = useTranslations('nav');
  const tUx = useTranslations('ux');
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const entries = useMemo<PaletteEntry[]>(() => {
    const groupOf = new Map<string, string>();
    for (const s of NAV_SECTIONS) {
      for (const e of s.entries) {
        if (isNavGroup(e)) for (const leaf of e.items) groupOf.set(leaf.href, t(e.label));
      }
    }
    const actions: PaletteEntry[] = QUICK_ACTIONS.map((a) => ({
      key: 'a:' + a.href,
      label: tUx(a.label),
      href: a.href,
      kind: 'action',
      haystack: normalizeSearch(`${tUx(a.label)} ${a.keywords}`),
    }));
    const pages: PaletteEntry[] = allNavLeaves().map((leaf) => ({
      key: 'p:' + leaf.href,
      label: t(leaf.label),
      hint: groupOf.get(leaf.href),
      href: leaf.href,
      kind: 'page',
      icon: leaf.icon,
      haystack: normalizeSearch(`${t(leaf.label)} ${groupOf.get(leaf.href) ?? ''} ${leaf.keywords ?? ''}`),
    }));
    return [...actions, ...pages];
  }, [t, tUx]);

  const results = useMemo(() => {
    const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return entries;
    return entries.filter((e) => words.every((w) => e.haystack.includes(w)));
  }, [entries, query]);

  const safeActive = Math.min(active, Math.max(results.length - 1, 0));

  const go = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    onClose();
    router.push(entry.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((safeActive + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((safeActive - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[safeActive]);
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  let lastKind: PaletteEntry['kind'] | null = null;

  return (
    <Modal isOpen onClose={onClose} title={tUx('goTo')} size="md">
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={results.length ? optionId(safeActive) : undefined}
        aria-label={tUx('goToHint')}
        placeholder={tUx('goToPlaceholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        style={{ width: '100%', height: 44, fontSize: 'var(--text-base)' }}
      />
      <ul id={listId} role="listbox" aria-label={tUx('goTo')} className="app-palette-list" style={{ marginTop: 'var(--space-2)' }}>
        {results.length === 0 && (
          <li role="presentation" style={{ padding: 'var(--space-4)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
            {tUx('goToEmpty')}
          </li>
        )}
        {results.map((entry, i) => {
          const header =
            entry.kind !== lastKind ? (
              <li key={'h:' + entry.kind} role="presentation" className="app-palette-group">
                {entry.kind === 'action' ? tUx('goToActions') : tUx('goToPages')}
              </li>
            ) : null;
          lastKind = entry.kind;
          const Icon = entry.icon ? NAV_ICONS[entry.icon] : Plus;
          return [
            header,
            <li
              key={entry.key}
              id={optionId(i)}
              role="option"
              aria-selected={i === safeActive}
              className="app-palette-item"
              onMouseMove={() => setActive(i)}
              onClick={() => go(entry)}
            >
              <Icon size={16} aria-hidden style={{ flexShrink: 0, color: 'var(--color-text-tertiary)' }} />
              <span>{entry.label}</span>
              {entry.hint && <small>{entry.hint}</small>}
            </li>,
          ];
        })}
      </ul>
    </Modal>
  );
}
