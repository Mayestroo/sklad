'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

interface ToastCardProps {
  toast: ToastItem;
  onClose: (id: string) => void;
}

export const ToastCard: React.FC<ToastCardProps> = ({ toast, onClose }) => {
  const duration = toast.duration || 4000;
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = 20;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= step) {
          clearInterval(timer);
          onClose(toast.id);
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [duration, isPaused, onClose, toast.id]);

  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: '#f0fdf4',
          border: '#bbf7d0',
          text: '#166534',
          iconColor: '#16a34a',
          barColor: '#22c55e',
          icon: <CheckCircle2 size={20} />,
        };
      case 'error':
        return {
          bg: '#fef2f2',
          border: '#fecaca',
          text: '#991b1b',
          iconColor: '#dc2626',
          barColor: '#ef4444',
          icon: <AlertCircle size={20} />,
        };
      case 'warning':
        return {
          bg: '#fffbeb',
          border: '#fde68a',
          text: '#92400e',
          iconColor: '#d97706',
          barColor: '#f59e0b',
          icon: <AlertTriangle size={20} />,
        };
      case 'info':
      default:
        return {
          bg: '#eff6ff',
          border: '#bfdbfe',
          text: '#1e40af',
          iconColor: '#2563eb',
          barColor: '#3b82f6',
          icon: <Info size={20} />,
        };
    }
  };

  const current = getStyles();

  return (
    <div
      role="alert"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        position: 'relative',
        backgroundColor: current.bg,
        border: `1px solid ${current.border}`,
        borderRadius: '12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        overflow: 'hidden',
        pointerEvents: 'auto',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ color: current.iconColor, flexShrink: 0, marginTop: '2px' }}>
        {current.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <h4
            style={{
              margin: '0 0 2px 0',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: current.text,
            }}
          >
            {toast.title}
          </h4>
        )}
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            lineHeight: 1.4,
            color: current.text,
            wordBreak: 'break-word',
          }}
        >
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        aria-label="Yopish"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          color: current.text,
          opacity: 0.6,
          flexShrink: 0,
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} />
      </button>

      {/* Progress Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: '3px',
          width: `${progress}%`,
          backgroundColor: current.barColor,
          opacity: 0.7,
          transition: 'width 20ms linear',
        }}
      />
    </div>
  );
};

export const ToastContainer: React.FC<{
  toasts: ToastItem[];
  onClose: (id: string) => void;
}> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '420px',
        width: 'calc(100vw - 40px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={onClose} />
      ))}
    </div>
  );
};
