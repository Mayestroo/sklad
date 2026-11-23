import React, { useId } from 'react';
import { useLocale } from 'next-intl';
import { X } from 'lucide-react';
import { DiscardPrompt, useDialog } from './useDialog';

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

/**
 * Dialog (Apple HIG / TZ "Ishlab chiqarish" 11.5). Behaviour lives in useDialog: Esc closes, focus
 * stays inside and returns to the opener, the page behind does not scroll, Ctrl+Enter submits, and a
 * close by backdrop / Esc / ✕ after typing asks first — inside this dialog, never a second one on top.
 * The footer stays pinned; on phones (< 768 px) the dialog fills the screen.
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, description, children, size = 'md', footer, onSubmitShortcut, confirmDiscard = true }) => {
  const titleId = useId();
  const descId = useId();
  const isRu = useLocale() === 'ru';
  const { surfaceRef, keepRef, asking, keepEditing, discard, requestClose, backdropProps } = useDialog({ isOpen, id: titleId, onClose, onSubmitShortcut, confirmDiscard });

  if (!isOpen) return null;
  const closeLabel = isRu ? 'Закрыть' : 'Yopish';

  return (
    <div
      className="app-modal-backdrop"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px', overflowY: 'auto' }}
      {...backdropProps}
    >
      <div
        ref={surfaceRef}
        className="app-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{ position: 'relative', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: sizeMap[size] || '560px', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflowY: 'auto', margin: 'auto', border: '1px solid var(--color-border)', outline: 'none' }}
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
        {asking && <DiscardPrompt isRu={isRu} keepRef={keepRef} onKeep={keepEditing} onDiscard={discard} />}
      </div>
    </div>
  );
};
