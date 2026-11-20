'use client';

import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts of a document form: Ctrl/⌘+S saves (draft), Ctrl/⌘+Enter
 * posts. Ignored while a dialog is open (the dialog owns Ctrl+Enter then).
 */
export function useDocumentShortcuts({ enabled, onSave, onPost }: { enabled: boolean; onSave?: () => void; onPost?: () => void }) {
  const handlers = useRef({ onSave, onPost });
  useEffect(() => {
    handlers.current = { onSave, onPost };
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if ((e.key === 's' || e.key === 'S' || e.code === 'KeyS') && handlers.current.onSave) {
        e.preventDefault();
        handlers.current.onSave();
      } else if (e.key === 'Enter' && handlers.current.onPost) {
        e.preventDefault();
        handlers.current.onPost();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
