import React, { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  /** Action bar pinned to the bottom, visible however long the content is. */
  footer?: React.ReactNode;
  /** Ctrl+Enter / ⌘+Enter runs this (the form's save). */
  onSubmitShortcut?: () => void;
}

const sizeMap: Record<string, string> = {
  sm: '400px',
  md: '560px',
  lg: '720px',
  xl: '960px',
  '2xl': '1100px',
  '3xl': '1280px',
  full: '95vw',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog (Apple HIG / TZ "Ishlab chiqarish" 11.5): Esc closes, focus stays
 * inside while open and returns to the opener when closed, the footer stays
 * pinned, and on phones (< 768 px) the dialog fills the screen.
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md', footer, onSubmitShortcut }) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const onSubmitRef = useRef(onSubmitShortcut);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    onSubmitRef.current = onSubmitShortcut;
  });

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    // Focus the first field (or the dialog) unless something inside already has it.
    const timer = window.setTimeout(() => {
      if (!dialog || dialog.contains(document.activeElement)) return;
      const first = dialog.querySelector<HTMLElement>('[autofocus], input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])');
      (first ?? dialog).focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      // A nested dialog (confirm, select popup) handles its own keys.
      if (dialog && e.target instanceof Node && !dialog.contains(e.target) && e.target !== document.body) return;
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        onCloseRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onSubmitRef.current) {
        e.preventDefault();
        onSubmitRef.current();
      } else if (e.key === 'Tab' && dialog) {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
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
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="app-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="app-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: sizeMap[size] || '560px',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflowY: 'auto',
          margin: 'auto',
          border: '1px solid var(--color-border)',
          outline: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 2 }}>
          <h3 id={titleId} style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish / Закрыть"
            title="Esc"
            style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-md)' }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div style={{ padding: '20px', flex: 1 }}>{children}</div>
        {footer && (
          <div
            className="app-modal-footer"
            style={{ position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 20px', borderTop: '1px solid var(--color-border-light)', background: 'var(--color-bg-secondary)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
