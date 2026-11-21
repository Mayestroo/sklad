'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Open/close state of a toolbar popover: closes on an outside click and on Esc
 * (focus returns to the trigger), and keeps the panel inside the viewport
 * (aligned to the trigger's right edge when it would overflow).
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current || !wrapRef.current) return;
    const trigger = wrapRef.current.getBoundingClientRect();
    const width = panelRef.current.offsetWidth;
    // Layout measurement decides the side; it cannot be known before render.
    setAlignRight(trigger.left + width > window.innerWidth - 16);
  }, [open]);

  return { open, setOpen, close, wrapRef, triggerRef, panelRef, alignRight };
}
