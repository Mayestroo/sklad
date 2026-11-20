'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
  /** Optional button (e.g. "Undo"); clicking it runs the action and closes the toast. */
  action?: { label: string; onClick: () => void };
}

interface ToastCardProps {
  toast: ToastItem;
  onClose: (id: string) => void;
}

/** Theme-aware colours (tokens switch in dark mode). */
const TONES: Record<ToastType, { bg: string; border: string; text: string; icon: string; bar: string; Icon: typeof Info }> = {
  success: { bg: 'var(--color-success-50)', border: 'var(--color-success-200)', text: 'var(--color-success-700)', icon: 'var(--color-success-600)', bar: 'var(--color-success-500)', Icon: CheckCircle2 },
  error: { bg: 'var(--color-error-50)', border: 'var(--color-error-200)', text: 'var(--color-error-700)', icon: 'var(--color-error-600)', bar: 'var(--color-error-500)', Icon: AlertCircle },
  warning: { bg: 'var(--color-warning-50)', border: 'var(--color-warning-200)', text: 'var(--color-warning-800)', icon: 'var(--color-warning-600)', bar: 'var(--color-warning-500)', Icon: AlertTriangle },
  info: { bg: 'var(--color-info-50)', border: 'var(--color-info-100)', text: 'var(--color-text-primary)', icon: 'var(--color-info-600)', bar: 'var(--color-info-500)', Icon: Info },
};

export const ToastCard: React.FC<ToastCardProps> = ({ toast, onClose }) => {
  const tUx = useTranslations('ux');
  // Errors stay longer (they carry instructions); toasts with an action give time to use it.
  const duration = toast.duration || (toast.type === 'error' ? 7000 : toast.action ? 6000 : 4000);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => onClose(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, onClose, toast.id]);

  const tone = TONES[toast.type];
  const Icon = tone.Icon;
  const urgent = toast.type === 'error' || toast.type === 'warning';

  return (
    <div
      role={urgent ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{
        position: 'relative',
        backgroundColor: 'var(--color-bg-secondary)',
        backgroundImage: `linear-gradient(${tone.bg}, ${tone.bg})`,
        border: `1px solid ${tone.border}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        padding: '12px 12px 12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ color: tone.icon, flexShrink: 0, marginTop: '1px' }} aria-hidden>
        <Icon size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div style={{ margin: '0 0 2px 0', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: tone.text }}>
            {toast.title}
          </div>
        )}
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.45, color: toast.title ? 'var(--color-text-primary)' : tone.text, wordBreak: 'break-word' }}>
          {toast.message}
        </p>
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onClose(toast.id);
          }}
          style={{
            flexShrink: 0,
            alignSelf: 'center',
            minHeight: 32,
            padding: '4px 12px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${tone.border}`,
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-semibold)',
            cursor: 'pointer',
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        aria-label={tUx('dismiss')}
        title={tUx('dismiss')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-secondary)',
          flexShrink: 0,
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} aria-hidden />
      </button>

      {/* Time-left bar (purely visual; the timeout above closes the toast). */}
      <div
        aria-hidden
        className="app-toast-timer"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '3px',
          backgroundColor: tone.bar,
          opacity: 0.6,
          animationDuration: `${duration}ms`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </div>
  );
};

export const ToastContainer: React.FC<{
  toasts: ToastItem[];
  onClose: (id: string) => void;
}> = ({ toasts, onClose }) => {
  // The region is always mounted so screen readers announce new toasts.
  return (
    <div className="app-toast-region" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={onClose} />
      ))}
    </div>
  );
};
