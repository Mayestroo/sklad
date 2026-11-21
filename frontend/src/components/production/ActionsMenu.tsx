'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** "⋯" menu (TZ 11.2): keyboard ↑ ↓ Enter Esc, focus returns to the button. */
export function ActionsMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const visible = actions.filter((a) => !a.hidden);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (visible.length === 0) return null;

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setActive(0);
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(0);
            setOpen(true);
          }
        }}
        style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (i + 1) % visible.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i - 1 + visible.length) % visible.length);
            } else if (e.key === 'Tab') {
              setOpen(false);
            }
          }}
          style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, minWidth: 220, padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', boxShadow: 'var(--shadow-xl)' }}
        >
          {visible.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                action.onSelect();
              }}
              style={{ display: 'block', width: '100%', minHeight: 40, padding: '8px 12px', textAlign: 'left', border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-sm)', color: action.danger ? 'var(--color-error-700)' : 'var(--color-text-primary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
