'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  /** Request in flight: disables the button, shows a spinner and, if given, `loadingText`. */
  loading?: boolean;
  loadingText?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  style,
  disabled: disabledProp,
  loading = false,
  loadingText,
  ...props
}: ButtonProps) {
  const disabled = disabledProp || loading;
  return (
    <button
      type={props.type || 'button'}
      disabled={disabled}
      aria-disabled={disabled}
      aria-busy={loading || undefined}
      style={{
        ...buttonStyle(variant, size),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
      {...props}
    >
      {loading && <Loader2 size={size === 'sm' ? 14 : 16} className="app-spinner" aria-hidden />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

/**
 * The button look as a style object, for a link that should look like a button
 * (`<Link style={buttonStyle('outline')}>`) — never nest a <button> inside a link.
 */
export function buttonStyle(variant: NonNullable<ButtonProps['variant']> = 'primary', size: NonNullable<ButtonProps['size']> = 'md'): CSSProperties {
  const getVariantStyles = (): CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: 'var(--color-btn-primary-bg, var(--color-primary-600))',
          color: 'var(--color-btn-primary-text, #ffffff)',
          border: 'none',
        };
      case 'secondary':
        return {
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--color-primary-600)',
          border: '1px solid var(--color-primary-300)',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--color-text-secondary)',
          border: 'none',
        };
      case 'danger':
        return {
          backgroundColor: 'var(--color-error-600)',
          color: 'var(--color-text-inverse)',
          border: 'none',
        };
    }
  };

  const getSizeStyles = (): CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: '6px 12px', fontSize: 'var(--text-xs)', minHeight: 32 };
      case 'md':
        return { padding: '8px 16px', fontSize: 'var(--text-sm)', minHeight: 38 };
      case 'lg':
        return { padding: '12px 24px', fontSize: 'var(--text-base)', minHeight: 44 };
    }
  };

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    borderRadius: 'var(--radius-md)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'all var(--transition-fast)',
    boxShadow: variant === 'primary' ? 'var(--shadow-xs)' : 'none',
    ...getVariantStyles(),
    ...getSizeStyles(),
  };
}
