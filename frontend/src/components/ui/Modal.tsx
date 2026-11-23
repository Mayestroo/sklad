import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title: what this dialog does or changes. */
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  /** Action bar pinned to the bottom, visible however long the content is. */
  footer?: React.ReactNode;
  /** Ctrl+Enter / ⌘+Enter runs this (the form's save). */
  onSubmitShortcut?: () => void;
  /**
   * Ask before closing when something was typed (backdrop, Esc, ✕). On by default;
   * pass false for dialogs whose fields are only filters or a read-only view.
   */
  confirmDiscard?: boolean;
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

/** Dialogs open at the same time (a confirmation over a form): only the top one handles keys and scroll lock. */
const openStack: string[] = [];

/**
 * Dialog (Apple HIG / TZ "Ishlab chiqarish" 11.5): Esc closes, focus stays inside while open and
 * returns to the opener when closed, the footer stays pinned, the page behind does not scroll, and on
 * phones (< 768 px) the dialog fills the screen. Closing by backdrop / Esc / ✕ after typing asks first
 * ("Kiritilganlar saqlanmaydi"), inside the same dialog — never a second dialog on top.
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, description, children, size = 'md', footer, onSubmitShortcut, confirmDiscard = true }) => {
  const titleId = useId();
  const descId = useId();
  const isRu = useLocale() === 'ru';
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const onSubmitRef = useRef(onSubmitShortcut);
  const dirtyRef = useRef(false);
  const pressedOnBackdrop = useRef(false);
  const [asking, setAsking] = useState(false);
  const askingRef = useRef(false);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    onSubmitRef.current = onSubmitShortcut;
    askingRef.current = asking;
  });

  /** Close from the dialog itself (backdrop, Esc, ✕): ask first if something was typed. */
  const requestClose = () => {
    if (confirmDiscard && dirtyRef.current) {
      setAsking(true);
      window.setTimeout(() => keepRef.current?.focus(), 0);
      return;
    }
    onCloseRef.current();
  };
  const requestCloseRef = useRef(requestClose);
  useLayoutEffect(() => {
    requestCloseRef.current = requestClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    const id = `${titleId}`;
    openStack.push(id);
    const isTop = () => openStack[openStack.length - 1] === id;
    dirtyRef.current = false;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the first field (or the dialog) unless something inside already has it.
    const timer = window.setTimeout(() => {
      if (!dialog || dialog.contains(document.activeElement)) return;
      const first = dialog.querySelector<HTMLElement>('[autofocus], input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])');
      (first ?? dialog).focus();
    }, 0);
    // Anything typed or chosen inside makes the dialog "dirty" (an accidental close would lose it).
    const markDirty = (e: Event) => {
      if (e.isTrusted) dirtyRef.current = true;
    };
    dialog?.addEventListener('input', markDirty, true);
    dialog?.addEventListener('change', markDirty, true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTop()) return;
      // A popup outside the dialog (select list, date picker) handles its own keys.
      if (dialog && e.target instanceof Node && !dialog.contains(e.target) && e.target !== document.body) return;
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (askingRef.current) setAsking(false);
        else requestCloseRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onSubmitRef.current && !askingRef.current) {
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
      dialog?.removeEventListener('input', markDirty, true);
      dialog?.removeEventListener('change', markDirty, true);
      const at = openStack.lastIndexOf(id);
      if (at >= 0) openStack.splice(at, 1);
      document.body.style.overflow = previousOverflow;
      setAsking(false);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen, titleId]);

  if (!isOpen) return null;

  const closeLabel = isRu ? 'Закрыть' : 'Yopish';

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
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Only a click that started and ended on the backdrop closes: selecting text in a field and
        // releasing the mouse outside the dialog must not throw the form away.
        if (e.target === e.currentTarget && pressedOnBackdrop.current) requestClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        ref={dialogRef}
        className="app-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{
          position: 'relative',
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
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 2 }}>
          <div style={{ minWidth: 0, paddingTop: 8 }}>
            <h2 id={titleId} style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
              {title}
            </h2>
            {description && (
              <p id={descId} style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-ghost"
            onClick={requestClose}
            aria-label={closeLabel}
            title={`${closeLabel} (Esc)`}
            style={{ flexShrink: 0, width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-md)' }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div style={{ padding: '20px', flex: 1 }}>{children}</div>
        {footer && !asking && (
          <div
            className="app-modal-footer"
            style={{ position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 20px', borderTop: '1px solid var(--color-border-light)', background: 'var(--color-bg-secondary)' }}
          >
            {footer}
          </div>
        )}
        {asking && (
          <div
            role="alert"
            className="app-modal-discard"
            style={{ position: 'sticky', bottom: 0, zIndex: 3, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', padding: '12px 20px', borderTop: '1px solid var(--color-warning-200, var(--color-border))', background: 'var(--color-warning-50)' }}
          >
            <span style={{ flex: '1 1 220px', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
              <strong style={{ fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Закрыть без сохранения?' : 'Saqlamasdan yopilsinmi?'}</strong>{' '}
              {isRu ? 'Введённые данные пропадут.' : 'Kiritilgan ma’lumotlar yo‘qoladi.'}
            </span>
            <span style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button ref={keepRef} type="button" className="ui-btn ui-btn-secondary" onClick={() => setAsking(false)} style={promptBtn('secondary')}>
                {isRu ? 'Продолжить ввод' : 'Davom etish'}
              </button>
              <button type="button" className="ui-btn ui-btn-danger" onClick={() => onCloseRef.current()} style={promptBtn('danger')}>
                {isRu ? 'Закрыть' : 'Yopish'}
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

function promptBtn(kind: 'secondary' | 'danger'): React.CSSProperties {
  return {
    minHeight: 36,
    padding: '6px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    ...(kind === 'danger'
      ? { background: 'var(--color-error-600)', color: 'var(--color-text-inverse)', border: 'none' }
      : { background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }),
  };
}
