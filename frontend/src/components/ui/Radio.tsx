'use client';

import React, { useId } from 'react';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'card';
  className?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      label,
      description,
      size = 'md',
      variant = 'default',
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

    const outerDimensions = {
      sm: 16,
      md: 20,
      lg: 24,
    }[size];

    const innerDimensions = {
      sm: 8,
      md: 10,
      lg: 12,
    }[size];

    if (variant === 'card') {
      return (
        <label
          htmlFor={id}
          className={className}
          style={{
            display: 'flex',
            alignItems: description ? 'flex-start' : 'center',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: `1.5px solid ${checked ? 'var(--color-primary-600)' : 'var(--color-border)'}`,
            backgroundColor: checked ? 'var(--color-primary-50)' : 'var(--color-bg-secondary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'all var(--transition-fast)',
            userSelect: 'none',
            boxShadow: checked ? '0 2px 8px rgba(79, 70, 229, 0.12)' : 'none',
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
              width: `${outerDimensions}px`,
              height: `${outerDimensions}px`,
              marginTop: description ? '2px' : '0',
            }}
          >
            <input
              ref={ref}
              type="radio"
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
                borderRadius: 'var(--radius-full)',
                border: `2px solid ${checked ? 'var(--color-primary-600)' : 'var(--color-border)'}`,
                backgroundColor: 'var(--color-bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all var(--transition-fast)',
              }}
            >
              {checked && (
                <div
                  style={{
                    width: `${innerDimensions}px`,
                    height: `${innerDimensions}px`,
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-primary-600)',
                    transition: 'transform var(--transition-fast)',
                    transform: 'scale(1)',
                  }}
                />
              )}
            </div>
          </div>

          {(label || description) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
              {label && (
                <span
                  style={{
                    fontSize: size === 'sm' ? 'var(--text-xs)' : size === 'lg' ? 'var(--text-base)' : 'var(--text-sm)',
                    fontWeight: checked ? 'var(--font-semibold)' : 'var(--font-medium)',
                    color: checked ? 'var(--color-primary-900)' : 'var(--color-text-primary)',
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
            </div>
          )}
        </label>
      );
    }

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
            width: `${outerDimensions}px`,
            height: `${outerDimensions}px`,
            marginTop: description ? '2px' : '0',
          }}
        >
          <input
            ref={ref}
            type="radio"
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
              borderRadius: 'var(--radius-full)',
              border: `2px solid ${checked ? 'var(--color-primary-600)' : 'var(--color-border)'}`,
              backgroundColor: 'var(--color-bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all var(--transition-fast)',
              boxShadow: checked ? '0 0 0 3px rgba(79, 70, 229, 0.15)' : 'none',
            }}
          >
            {checked && (
              <div
                style={{
                  width: `${innerDimensions}px`,
                  height: `${innerDimensions}px`,
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-600)',
                  transition: 'transform var(--transition-fast)',
                  transform: 'scale(1)',
                }}
              />
            )}
          </div>
        </div>

        {(label || description) && (
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
          </label>
        )}
      </div>
    );
  }
);

Radio.displayName = 'Radio';
