'use client';

import React, { useId } from 'react';
import { CurrencyInput } from './CurrencyInput';

/**
 * A labelled money field with thousands separators (muammolar.pdf B5:
 * "1000000" was typed into bare number inputs). Same label and layout as
 * `Input`; the value is reported as text so forms that keep amounts as
 * strings can use it directly. Exchange rates stay plain inputs (an empty
 * rate must not become 0, ADR 0022).
 */
export interface MoneyInputProps {
  label?: string;
  value: number | string | null | undefined;
  onValueChange: (value: string) => void;
  decimals?: number;
  placeholder?: string;
  disabled?: boolean;
  max?: number;
  id?: string;
  'aria-label'?: string;
  error?: string;
  style?: React.CSSProperties;
}

export function MoneyInput({
  label,
  value,
  onValueChange,
  decimals = 2,
  placeholder = '0',
  disabled,
  max,
  id,
  'aria-label': ariaLabel,
  error,
  style,
}: MoneyInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: style?.width || '100%' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}
        >
          {label}
        </label>
      )}
      <CurrencyInput
        id={inputId}
        aria-label={ariaLabel ?? label}
        value={value ?? ''}
        onChange={(next) => onValueChange(String(next))}
        decimals={decimals}
        placeholder={placeholder}
        disabled={disabled}
        max={max}
        style={{ width: '100%', ...(error ? { borderColor: 'var(--color-error-600)' } : {}), ...style }}
      />
      {error && (
        <span role="alert" style={{ fontSize: '11px', color: 'var(--color-error-600)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
