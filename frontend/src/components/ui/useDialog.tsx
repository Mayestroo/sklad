'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Fields that only look something up (typing in them is not an edit to protect). */
const IGNORED_FIELDS = 'input[type="search"], [role="combobox"]';
/** Choices in the app's custom controls (Select options, segmented radios, checkboxes, calendar days). */
const CHOICES = '[role="option"], [role="radio"], [role="checkbox"], [role="switch"], [role="gridcell"] button, [role="gridcell"][tabindex]';

/** Dialogs and drawers open at the same time: only the top one handles keys. */
const openStack: string[] = [];

/**
 * The element that had focus before the latest focus move. A field with autoFocus inside a dialog
 * takes focus while React mounts it — before the dialog's effect runs — so at that point the opener
 * is the element focused just before.
 */
let focusedBefore: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusout', (e) => {
    if (e.target instanceof HTMLElement) focusedBefore = e.target;
  }, true);
}

export interface DialogOptions {
  isOpen: boolean;
  /** Stable id of this surface (useId()). */
  id: string;
  onClose: () => void;
  onSubmitShortcut?: () => void;
  /** Ask before closing (backdrop, Esc, ✕) once something was typed. */
  confirmDiscard: boolean;
}

/**
 * Shared behaviour of Modal and Drawer (Apple HIG): the page behind does not scroll, focus moves in
 * and stays inside (Tab wraps), returns to the opener on close, Esc closes, Ctrl+Enter submits, only
 * the top surface reacts to keys, and a close requested by the surface itself (backdrop, Esc, ✕) asks
 * first when something was typed. A popup outside the surface (select list, date picker) keeps its keys.
 */
export function useDialog({ isOpen, id, onClose, onSubmitShortcut, confirmDiscard }: DialogOptions) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const dirtyRef = useRef(false);
  const pressedOnBackdrop = useRef(false);
  const [asking, setAsking] = useState(false);
  const latest = useRef({ onClose, onSubmitShortcut, confirmDiscard, asking });
  useLayoutEffect(() => {
    latest.current = { onClose, onSubmitShortcut, confirmDiscard, asking };
  });

  const requestClose = () => {
    if (latest.current.confirmDiscard && dirtyRef.current) {
      setAsking(true);
      window.setTimeout(() => keepRef.current?.focus(), 0);
      return;
    }
    latest.current.onClose();
  };
  const requestCloseRef = useRef(requestClose);
  useLayoutEffect(() => {
    requestCloseRef.current = requestClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    openStack.push(id);
    const isTop = () => openStack[openStack.length - 1] === id;
    dirtyRef.current = false;
    const surface = surfaceRef.current;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opener = active && surface?.contains(active) ? focusedBefore : active;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      if (!surface || surface.contains(document.activeElement)) return;
      // A field marked autofocus, else the first control of the content (not the ✕ in the header).
      const body = surface.querySelector<HTMLElement>('.dlg-body') ?? surface;
      const controls = Array.from(body.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = surface.querySelector<HTMLElement>('[autofocus]') ?? controls.find((el) => el.offsetParent !== null) ?? controls[0];
      (first ?? surface).focus();
    }, 0);
    // Typing or choosing in a field fires input/change; filling a field from code (React) does not.
    // Search boxes and comboboxes only look things up — they are not data the person would lose.
    const markDirty = (e: Event) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el && (el.matches(IGNORED_FIELDS) || el.closest('[data-dialog-ignore]'))) return;
      dirtyRef.current = true;
    };
    // The app's own selects and date pickers open in a portal (outside the surface) and fire no
    // input/change: a click on a choice while this surface is on top counts as an edit too.
    const markChoice = (e: MouseEvent) => {
      if (!isTop()) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(CHOICES) && !el.closest('[data-dialog-ignore]')) dirtyRef.current = true;
    };
    surface?.addEventListener('input', markDirty, true);
    surface?.addEventListener('change', markDirty, true);
    document.addEventListener('click', markChoice, true);

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (surface && e.target instanceof Node && !surface.contains(e.target) && e.target !== document.body) return;
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (latest.current.asking) setAsking(false);
        else requestCloseRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && latest.current.onSubmitShortcut && !latest.current.asking) {
        e.preventDefault();
        latest.current.onSubmitShortcut();
      } else if (e.key === 'Tab' && surface) {
        const items = Array.from(surface.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      surface?.removeEventListener('input', markDirty, true);
      surface?.removeEventListener('change', markDirty, true);
      document.removeEventListener('click', markChoice, true);
      const at = openStack.lastIndexOf(id);
      if (at >= 0) openStack.splice(at, 1);
      document.body.style.overflow = previousOverflow;
      setAsking(false);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen, id]);

  /** Props for the backdrop: only a click that starts and ends on it closes (not a drag out of a field). */
  const backdropProps = {
    onMouseDown: (e: React.MouseEvent) => {
      pressedOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && pressedOnBackdrop.current) requestClose();
      pressedOnBackdrop.current = false;
    },
  };

  return { surfaceRef, keepRef, asking, keepEditing: () => setAsking(false), discard: () => latest.current.onClose(), requestClose, backdropProps };
}

/** "Close without saving?" bar shown inside the surface, in place of its footer. */
export function DiscardPrompt({ isRu, keepRef, onKeep, onDiscard, padding = '12px 20px' }: { isRu: boolean; keepRef: React.Ref<HTMLButtonElement>; onKeep: () => void; onDiscard: () => void; padding?: string }) {
  const btn = (kind: 'secondary' | 'danger'): React.CSSProperties => ({
    minHeight: 36,
    padding: '6px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    ...(kind === 'danger'
      ? { background: 'var(--color-error-600)', color: 'var(--color-text-inverse)', border: 'none' }
      : { background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }),
  });
  return (
    <div
      role="alert"
      className="app-dialog-discard"
      style={{ position: 'sticky', bottom: 0, zIndex: 11, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', padding, borderTop: '1px solid var(--color-warning-200)', background: 'var(--color-warning-50)' }}
    >
      <span style={{ flex: '1 1 220px', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
        <strong style={{ fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Закрыть без сохранения?' : 'Saqlamasdan yopilsinmi?'}</strong>{' '}
        {isRu ? 'Введённые данные пропадут.' : 'Kiritilgan ma’lumotlar yo‘qoladi.'}
      </span>
      <span style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button ref={keepRef} type="button" className="ui-btn ui-btn-secondary" onClick={onKeep} style={btn('secondary')}>
          {isRu ? 'Продолжить ввод' : 'Davom etish'}
        </button>
        <button type="button" className="ui-btn ui-btn-danger" onClick={onDiscard} style={btn('danger')}>
          {isRu ? 'Закрыть' : 'Yopish'}
        </button>
      </span>
    </div>
  );
}
