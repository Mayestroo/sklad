'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/Modal';

/** "?" — list of keyboard shortcuts. */
export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tUx = useTranslations('ux');
  if (!open) return null;
  const rows: Array<[string, string]> = [
    ['Ctrl K', tUx('shortcutGoTo')],
    ['Ctrl Enter', tUx('shortcutSave')],
    ['Esc', tUx('shortcutClose')],
    ['?', tUx('shortcutHelp')],
  ];
  return (
    <Modal isOpen onClose={onClose} title={tUx('shortcutsTitle')} size="sm">
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-3) var(--space-4)', alignItems: 'center' }}>
        {rows.map(([keys, label]) => (
          <div key={keys} style={{ display: 'contents' }}>
            <dt>
              <kbd className="app-kbd">{keys}</kbd>
            </dt>
            <dd style={{ color: 'var(--color-text-primary)' }}>{label}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

/** True when the key event comes from a text field (shortcuts must not fire there). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
