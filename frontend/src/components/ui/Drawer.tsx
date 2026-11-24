'use client';

import React, { useId } from 'react';
import { useLocale } from 'next-intl';
import { DiscardPrompt, useDialog } from './useDialog';
import { DialogFooter, DialogHeader, type DialogTone } from './DialogParts';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: DialogTone;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  onSubmitShortcut?: () => void;
  /** Ask before closing (backdrop, Esc, ✕) once something was typed. On by default; false for read-only panels. */
  confirmDiscard?: boolean;
}

const sizeMap: Record<string, string> = {
  sm: '420px',
  md: '560px',
  lg: '720px',
  xl: '900px',
  full: '100%',
};

/**
 * Side panel for a focused sub-task (a form, a preview). Same behaviour as Modal (useDialog): focus
 * moves in and stays, returns to the opener, Esc / backdrop / ✕ close and ask first after typing,
 * Ctrl+Enter submits, the page behind does not scroll. Full width on phones.
 */
export const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, description, icon, tone, badge, children, footer, size = 'md', onSubmitShortcut, confirmDiscard = true }) => {
  const titleId = useId();
  const descId = useId();
  const isRu = useLocale() === 'ru';
  const { surfaceRef, keepRef, asking, keepEditing, discard, requestClose, backdropProps } = useDialog({ isOpen, id: titleId, onClose, onSubmitShortcut, confirmDiscard });

  if (!isOpen) return null;
  const closeLabel = isRu ? 'Закрыть' : 'Yopish';

  return (
    <div
      className="app-drawer-backdrop dlg-backdrop"
      style={{ zIndex: 1050, display: 'flex', justifyContent: 'flex-end' }}
      {...backdropProps}
    >
      <div
        ref={surfaceRef}
        className="app-drawer dlg-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{ width: '100%', maxWidth: sizeMap[size] || '560px', height: '100%' }}
      >
        <DialogHeader titleId={titleId} descId={descId} title={title} description={description} icon={icon} tone={tone} badge={badge} closeLabel={closeLabel} onClose={requestClose} />
        <div className="dlg-body">{children}</div>
        {footer && !asking && (
          <DialogFooter shortcut={Boolean(onSubmitShortcut)} isRu={isRu} onCancel={requestClose}>
            {footer}
          </DialogFooter>
        )}
        {asking && <DiscardPrompt isRu={isRu} keepRef={keepRef} onKeep={keepEditing} onDiscard={discard} padding="14px 24px" />}
      </div>
    </div>
  );
};
