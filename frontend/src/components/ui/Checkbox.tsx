'use client';

import React, { useId } from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  error?: string;
  className?: string;
}

/**
 * Checkbox with a label. The box itself is the native input styled once in
 * globals.css (`input[type='checkbox']`), so this component and every plain
 * checkbox in tables and popovers look the same.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, size = 'md', error, disabled, className = '', style, id: customId, ...props }, ref) => {
    const generatedId = useId();
    const id = customId || generatedId;
    const box = { sm: 16, md: 18, lg: 22 }[size];
    const errorId = error ? `${id}-error` : undefined;

    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: description ? 'flex-start' : 'center',
          gap: '10px',
          opacity: disabled ? 0.6 : 1,
          userSelect: 'none',
          ...style,
        }}
      >
        <input
          ref={ref}
          type="checkbox"
          id={id}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          style={{
            width: box,
            height: box,
            marginTop: description ? 2 : 0,
            borderColor: error ? 'var(--color-error-600)' : undefined,
          }}
          {...props}
        />

        {(label || description || error) && (
          <label htmlFor={id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', cursor: disabled ? 'not-allowed' : 'pointer' }}>
            {label && (
              <span
                style={{
                  fontSize: size === 'sm' ? 'var(--text-xs)' : size === 'lg' ? 'var(--text-base)' : 'var(--text-sm)',
                  fontWeight: 'var(--font-medium)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {label}
              </span>
            )}
            {description && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{description}</span>}
            {error && (
              <span id={errorId} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error-700)' }}>
                {error}
              </span>
            )}
          </label>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
