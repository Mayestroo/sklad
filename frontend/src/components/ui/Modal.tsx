import React, { useId } from 'react';
import { useLocale } from 'next-intl';
import { DiscardPrompt, useDialog } from './useDialog';
import { DialogFooter, DialogHeader, type DialogTone } from './DialogParts';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title: what this dialog does or changes. */
  description?: React.ReactNode;
  /** Icon in a tinted tile before the title (lucide icon, size 20). */
  icon?: React.ReactNode;
  /** Tint of the icon tile; status tones only for status (a payment in, a write-off). */
  tone?: DialogTone;
  /** Small element after the title (a status badge). */
  badge?: React.ReactNode;
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
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, description, icon, tone, badge, children, size = 'md', footer, onSubmitShortcut, confirmDiscard = true }) => {
  const titleId = useId();
  const descId = useId();
  const isRu = useLocale() === 'ru';
  const { surfaceRef, keepRef, asking, keepEditing, discard, requestClose, backdropProps } = useDialog({ isOpen, id: titleId, onClose, onSubmitShortcut, confirmDiscard });

  if (!isOpen) return null;
  const closeLabel = isRu ? 'Закрыть' : 'Yopish';

  return (
    <div
      className="app-modal-backdrop dlg-backdrop"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
      {...backdropProps}
    >
      <div
        ref={surfaceRef}
        className="app-modal dlg-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{ position: 'relative', width: '100%', maxWidth: sizeMap[size] || '560px', maxHeight: 'min(90vh, 900px)' }}
      >
        <DialogHeader titleId={titleId} descId={descId} title={title} description={description} icon={icon} tone={tone} badge={badge} closeLabel={closeLabel} onClose={requestClose} />
        <div className="dlg-body">{children}</div>
        {footer && !asking && (
          <DialogFooter shortcut={Boolean(onSubmitShortcut)} isRu={isRu}>
            {footer}
          </DialogFooter>
        )}
        {asking && <DiscardPrompt isRu={isRu} keepRef={keepRef} onKeep={keepEditing} onDiscard={discard} padding="14px 24px" />}
      </div>
    </div>
  );
};
