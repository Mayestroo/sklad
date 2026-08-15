'use client';

import React, { useId } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  error?: string;
  className?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      size = 'md',
      error,
      disabled,
      checked,
      className = '',
      style,
      id: customId,
      onChange,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = customId || generatedId;

    const sizeDimensions = {
      sm: 16,
      md: 20,
      lg: 24,
    }[size];

    const iconSizes = {
      sm: 12,
      md: 14,
      lg: 18,
    }[size];

    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: description ? 'flex-start' : 'center',
          gap: '10px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          userSelect: 'none',
          ...style,
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            width: `${sizeDimensions}px`,
            height: `${sizeDimensions}px`,
            marginTop: description ? '2px' : '0',
          }}
        >
          <input
            ref={ref}
            type="checkbox"
            id={id}
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              opacity: 0,
              margin: 0,
              cursor: disabled ? 'not-allowed' : 'pointer',
              zIndex: 1,
            }}
            {...props}
          />
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${
                error
                  ? 'var(--color-error-500)'
                  : checked
                  ? 'var(--color-primary-600)'
                  : 'var(--color-border)'
              }`,
              backgroundColor: checked ? 'var(--color-primary-600)' : 'var(--color-bg-secondary)',
              boxShadow: checked ? '0 2px 4px rgba(79, 70, 229, 0.25)' : 'var(--shadow-xs)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              transition: 'all var(--transition-fast)',
            }}
          >
            {checked && <Check size={iconSizes} strokeWidth={3} />}
          </div>
        </div>

        {(label || description || error) && (
          <label
            htmlFor={id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
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
            {description && (
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {description}
              </span>
            )}
            {error && (
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-error-500)',
                }}
              >
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
