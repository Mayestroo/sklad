'use client';

import React, { useId } from 'react';
import { useLocale } from 'next-intl';
import { X } from 'lucide-react';
import { DiscardPrompt, useDialog } from './useDialog';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
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
export const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, description, icon, badge, children, footer, size = 'md', onSubmitShortcut, confirmDiscard = true }) => {
  const titleId = useId();
  const descId = useId();
  const isRu = useLocale() === 'ru';
  const { surfaceRef, keepRef, asking, keepEditing, discard, requestClose, backdropProps } = useDialog({ isOpen, id: titleId, onClose, onSubmitShortcut, confirmDiscard });

  if (!isOpen) return null;
  const closeLabel = isRu ? 'Закрыть' : 'Yopish';

  return (
    <div
      className="app-drawer-backdrop"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1050, display: 'flex', justifyContent: 'flex-end' }}
      {...backdropProps}
    >
      <div
        ref={surfaceRef}
        className="app-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{ width: '100%', maxWidth: sizeMap[size] || '560px', height: '100%', backgroundColor: 'var(--color-bg-secondary)', borderLeft: '1px solid var(--color-border)', boxShadow: 'var(--shadow-2xl, -8px 0 24px rgba(0, 0, 0, 0.15))', display: 'flex', flexDirection: 'column', outline: 'none', animation: 'drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', backgroundColor: 'var(--color-bg-secondary)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {icon && (
              <div aria-hidden style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {icon}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 id={titleId} style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', margin: 0 }}>
                  {title}
                </h2>
                {badge}
              </div>
              {description && (
                <p id={descId} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '3px', marginBottom: 0 }}>
                  {description}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-ghost"
            onClick={requestClose}
            aria-label={closeLabel}
            title={`${closeLabel} (Esc)`}
            style={{ flexShrink: 0, width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-md)' }}
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>{children}</div>

        {footer && !asking && (
          <div className="app-drawer-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-secondary)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>{footer}</div>
        )}
        {asking && <DiscardPrompt isRu={isRu} keepRef={keepRef} onKeep={keepEditing} onDiscard={discard} padding="16px 24px" />}
      </div>

      <style jsx global>{`
        @keyframes drawerSlideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};
