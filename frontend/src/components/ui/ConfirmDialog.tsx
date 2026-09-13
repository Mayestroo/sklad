'use client';

import React, { useEffect, useId } from 'react';
import { useLocale } from 'next-intl';
import { AlertCircle, AlertTriangle, HelpCircle, Trash2, X } from 'lucide-react';
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

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  options,
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  const descId = useId();
  const locale = useLocale();
  const isRu = locale === 'ru';

  const {
    title,
    description,
    variant = 'info',
    confirmText,
    cancelText,
  } = options;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const defaultTitle = () => {
    if (variant === 'danger') return isRu ? 'Подтверждение удаления' : 'O‘chirishni tasdiqlang';
    if (variant === 'warning') return isRu ? 'Предупреждение' : 'Ogohlantirish';
    return isRu ? 'Подтверждение' : 'Tasdiqlash';
  };

  const defaultConfirmText = () => {
    if (variant === 'danger') return isRu ? 'Удалить' : 'O‘chirish';
    if (variant === 'warning') return isRu ? 'Да, продолжить' : 'Ha, davom etish';
    return isRu ? 'Подтвердить' : 'Tasdiqlash';
  };

  const defaultCancelText = () => (isRu ? 'Отмена' : 'Bekor qilish');

  const getVariantIcon = () => {
    switch (variant) {
      case 'danger':
        return (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.15)',
            }}
          >
            <Trash2 size={24} />
          </div>
        );
      case 'warning':
        return (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#fef3c7',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 4px 12px rgba(217, 119, 6, 0.15)',
            }}
          >
            <AlertTriangle size={24} />
          </div>
        );
      case 'info':
      default:
        return (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#e0e7ff',
              color: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.15)',
            }}
          >
            <HelpCircle size={24} />
          </div>
        );
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9998,
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        style={{
          backgroundColor: 'var(--color-bg-primary, #ffffff)',
          color: 'var(--color-text-primary, #0f172a)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--color-border, #e2e8f0)',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          position: 'relative',
          animation: 'scaleUp 0.15s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Yopish"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary, #94a3b8)',
            padding: '4px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {getVariantIcon()}
          <h3
            id={titleId}
            style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              margin: '0 0 8px 0',
              color: 'var(--color-text-primary, #0f172a)',
            }}
          >
            {title || defaultTitle()}
          </h3>
          {description && (
            <p
              id={descId}
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary, #64748b)',
                margin: '0 0 24px 0',
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'stretch',
            marginTop: description ? 0 : 16,
          }}
        >
          <Button
            variant="secondary"
            onClick={onCancel}
            style={{ flex: 1, padding: '10px 16px', fontWeight: 600 }}
          >
            {cancelText || defaultCancelText()}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            autoFocus
            style={{
              flex: 1,
              padding: '10px 16px',
              fontWeight: 600,
              backgroundColor:
                variant === 'warning'
                  ? '#d97706'
                  : variant === 'danger'
                  ? 'var(--color-error-600, #dc2626)'
                  : undefined,
              borderColor: variant === 'warning' ? '#d97706' : undefined,
            }}
          >
            {confirmText || defaultConfirmText()}
          </Button>
        </div>
      </div>
    </div>
  );
};
