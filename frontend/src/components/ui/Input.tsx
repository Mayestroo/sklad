import React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, size = 'md', style, className, ...props }, ref) => {
    const sizeStyles = {
      sm: { height: '32px', padding: '4px 10px', fontSize: 'var(--text-xs)' },
      md: { height: '38px', padding: '8px 12px', fontSize: 'var(--text-sm)' },
      lg: { height: '44px', padding: '10px 14px', fontSize: 'var(--text-base)' },
    }[size];

    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: style?.width || '100%' }}>
        {label && (
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          style={{
            boxSizing: 'border-box',
            borderRadius: 'var(--radius-md)',
            border: error ? '1px solid var(--color-error-600)' : '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-input)',
            color: 'var(--color-text-primary)',
            outline: 'none',
            width: '100%',
            transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
            ...sizeStyles,
            ...style,
          }}
          {...props}
        />
        {error && <span style={{ fontSize: '11px', color: 'var(--color-error-600)' }}>{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
