import { ReactNode } from 'react';

export interface BadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  const getStyles = () => {
    switch (variant) {
      case 'success':
        return {
          backgroundColor: 'var(--color-success-50)',
          color: 'var(--color-success-600)',
          border: '1px solid var(--color-success-100)',
        };
      case 'warning':
        return {
          backgroundColor: 'var(--color-warning-50)',
          color: 'var(--color-warning-600)',
          border: '1px solid var(--color-warning-100)',
        };
      case 'error':
        return {
          backgroundColor: 'var(--color-error-50)',
          color: 'var(--color-error-600)',
          border: '1px solid var(--color-error-100)',
        };
      case 'info':
        return {
          backgroundColor: 'var(--color-info-50)',
          color: 'var(--color-info-600)',
          border: '1px solid var(--color-info-100)',
        };
      case 'neutral':
      default:
        return {
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border-light)',
        };
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-medium)',
        lineHeight: 1.4,
        ...getStyles(),
      }}
    >
      {children}
    </span>
  );
}
