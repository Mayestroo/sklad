'use client';

import React, { useEffect, useId, useRef } from 'react';
import { useLocale } from 'next-intl';
import { AlertTriangle, HelpCircle, Trash2, X } from 'lucide-react';
import { Button } from './Button';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
  title?: string;
  description?: string;
  variant?: ConfirmVariant;
  confirmText?: string;
  cancelText?: string;
}

interface ConfirmDialogProps {
  isOpen: boolean;
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE: Record<ConfirmVariant, { bg: string; fg: string; Icon: typeof Trash2 }> = {
  danger: { bg: 'var(--color-error-50)', fg: 'var(--color-error-700)', Icon: Trash2 },
  warning: { bg: 'var(--color-warning-50)', fg: 'var(--color-warning-700)', Icon: AlertTriangle },
  info: { bg: 'var(--color-primary-50)', fg: 'var(--color-primary-700)', Icon: HelpCircle },
};

/**
 * The app's confirmation (ADR 0021). Says what will happen, the safe choice first:
 * for a destructive action focus starts on "Cancel", so a stray Enter does not delete.
 * Esc / the backdrop / ✕ cancel; Tab stays inside. Theme tokens only (light and dark).
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, options, onConfirm, onCancel }) => {
  const titleId = useId();
  const descId = useId();
  const locale = useLocale();
  const isRu = locale === 'ru';
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const pressedOnBackdrop = useRef(false);

  const { title, description, variant = 'info', confirmText, cancelText } = options;

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => (variant === 'danger' ? cancelRef.current : confirmRef.current)?.focus(), 0);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Tab' && dialogRef.current) {
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
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
    // Capture phase: the confirmation sits above an open Modal, whose own Esc must not fire too.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown, true);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen, onCancel, variant]);

  if (!isOpen) return null;

  const defaultTitle = variant === 'danger' ? (isRu ? 'Подтверждение удаления' : 'O‘chirishni tasdiqlang') : variant === 'warning' ? (isRu ? 'Предупреждение' : 'Ogohlantirish') : isRu ? 'Подтверждение' : 'Tasdiqlash';
  const defaultConfirm = variant === 'danger' ? (isRu ? 'Удалить' : 'O‘chirish') : variant === 'warning' ? (isRu ? 'Да, продолжить' : 'Ha, davom etish') : isRu ? 'Подтвердить' : 'Tasdiqlash';
  const { bg, fg, Icon } = TONE[variant];

  return (
    <div
      className="app-confirm-backdrop"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998, padding: 'var(--space-4)', animation: 'fadeIn 0.15s ease-out' }}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Only a click that started and ended on the backdrop cancels (not a drag out of the dialog).
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onCancel();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        style={{ position: 'relative', width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', boxShadow: 'var(--shadow-xl)' }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label={isRu ? 'Закрыть' : 'Yopish'}
          title="Esc"
          className="ui-btn ui-btn-ghost"
          style={{ position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)', width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
        >
          <X size={18} aria-hidden />
        </button>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', paddingRight: 'var(--space-6)' }}>
          <span aria-hidden style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 'var(--radius-full)', backgroundColor: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', lineHeight: 1.4 }}>
              {title || defaultTitle}
            </h2>
            {description && (
              <p id={descId} style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Safe choice first (left), the action last (right). */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelText || (isRu ? 'Отмена' : 'Bekor qilish')}
          </Button>
          <Button ref={confirmRef} variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText || defaultConfirm}
          </Button>
        </div>
      </div>
    </div>
  );
};
