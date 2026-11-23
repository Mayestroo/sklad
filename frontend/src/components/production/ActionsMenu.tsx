'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

const GAP = 4;
const MARGIN = 8;

/**
 * "⋯" menu (TZ 11.2): keyboard ↑ ↓ Enter Esc, focus returns to the button.
 * The menu is rendered in a portal with fixed position, so a table's scroll
 * container never clips it; it opens upward when there is no room below.
 */
export function ActionsMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const visible = actions.filter((a) => !a.hidden);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const btn = buttonRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const r = btn.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.scrollHeight;
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const up = h > below && above > below;
    const maxHeight = Math.max(120, up ? above : below);
    const top = up ? Math.max(MARGIN, r.top - GAP - Math.min(h, maxHeight)) : r.bottom + GAP;
    const left = Math.min(Math.max(MARGIN, r.right - w), window.innerWidth - w - MARGIN);
    setPos({ top, left, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open || !pos) return;
    menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[active]?.focus({ preventScroll: true });
  }, [open, pos, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // The menu follows its button while the page or the table scrolls; once the button
    // leaves the screen the menu closes.
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) setOpen(false);
      else place();
    };
    const onResize = () => place();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, place]);

  if (visible.length === 0) return null;

  const close = () => {
    setOpen(false);
    setPos(null);
    buttonRef.current?.focus();
  };

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        className="ux-menu-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setActive(0);
          setPos(null);
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(0);
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            className="ux-menu"
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
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              maxHeight: pos?.maxHeight,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            {visible.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="ux-menu-item"
                data-danger={action.danger || undefined}
                onClick={() => {
                  close();
                  action.onSelect();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
