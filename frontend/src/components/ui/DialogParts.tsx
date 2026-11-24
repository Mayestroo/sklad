'use client';

import React from 'react';
import { X } from 'lucide-react';

export type DialogTone = 'primary' | 'success' | 'warning' | 'error' | 'info';

/** Header shared by Modal and Drawer: optional icon tile, title (+badge), one-line description, ✕. */
export function DialogHeader({
  titleId,
  descId,
  title,
  description,
  icon,
  tone = 'primary',
  badge,
  closeLabel,
  onClose,
}: {
  titleId: string;
  descId: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: DialogTone;
  badge?: React.ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="dlg-header">
      {icon && (
        <span className="dlg-icon" data-tone={tone === 'primary' ? undefined : tone} aria-hidden>
          {icon}
        </span>
      )}
      <div className="dlg-heading">
        <div className="dlg-title-row">
          <h2 id={titleId} className="dlg-title">
            {title}
          </h2>
          {badge}
        </div>
        {description && (
          <p id={descId} className="dlg-desc">
            {description}
          </p>
        )}
      </div>
      <button type="button" className="dlg-close" onClick={onClose} aria-label={closeLabel} title={`${closeLabel} (Esc)`}>
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}

/** Pinned action bar. With a submit shortcut, a quiet "Ctrl + Enter" hint sits on the left (desktop only). */
export function DialogFooter({ children, shortcut, isRu }: { children: React.ReactNode; shortcut?: boolean; isRu: boolean }) {
  return (
    <div className="dlg-footer app-modal-footer">
      {shortcut && (
        <span className="dlg-hint">
          <kbd className="app-kbd">Ctrl</kbd>+<kbd className="app-kbd">Enter</kbd>
          <span>{isRu ? '— сохранить' : '— saqlash'}</span>
        </span>
      )}
      <div className="dlg-actions">{children}</div>
    </div>
  );
}
