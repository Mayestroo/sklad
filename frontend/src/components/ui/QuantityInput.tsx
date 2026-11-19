'use client';

import React, { useId } from 'react';
import { useLocale } from 'next-intl';
import { CurrencyInput } from './CurrencyInput';
import { unitLabel } from '@/lib/units';

/**
 * A quantity field that always says what it counts: the product's unit is
 * shown inside the field ("12.5 kg", "3 dona"), and the number is grouped
 * like money ("1,250"). Up to 3 decimals, as quantities are stored.
 * Emptying the field reports '' so a required quantity stays visibly empty.
 */
export interface QuantityInputProps {
  /** Unit code of the product card ('piece', 'kg', … or a custom unit). */
  unit: string | null | undefined;
  value: number | string | null | undefined;
  onValueChange: (value: string) => void;
  label?: string;
  'aria-label'?: string;
  placeholder?: string;
  disabled?: boolean;
  max?: number;
  decimals?: number;
  /** Red border, e.g. more than is in stock. */
  invalid?: boolean;
  error?: string;
  id?: string;
  style?: React.CSSProperties;
}

export function QuantityInput({
  unit,
  value,
  onValueChange,
  label,
  'aria-label': ariaLabel,
  placeholder = '0',
  disabled,
  max,
  decimals = 3,
  invalid,
  error,
  id,
  style,
}: QuantityInputProps) {
  const locale = useLocale();
  const generatedId = useId();
  const inputId = id || generatedId;
  const suffix = unit ? unitLabel(unit, locale) : '';
  // Room for the unit inside the field (about 1ch per letter + padding).
  const suffixWidth = suffix ? `${Math.max(3, suffix.length) + 2}ch` : '0px';

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
      <div style={{ position: 'relative', width: '100%' }}>
        <CurrencyInput
          id={inputId}
          aria-label={[ariaLabel ?? label, suffix].filter(Boolean).join(', ')}
          value={value ?? ''}
          onChange={(next) => onValueChange(String(next))}
          onClear={() => onValueChange('')}
          decimals={decimals}
          placeholder={placeholder}
          disabled={disabled}
          max={max}
          style={{
            width: '100%',
            paddingRight: `calc(${suffixWidth} + 6px)`,
            ...(invalid || error ? { borderColor: 'var(--color-error-600)' } : {}),
            ...style,
          }}
        />
        {suffix && (
          <span
            aria-hidden="true"
            data-testid="quantity-unit"
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              pointerEvents: 'none',
              zIndex: 6,
              whiteSpace: 'nowrap',
            }}
          >
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <span role="alert" style={{ fontSize: '11px', color: 'var(--color-error-600)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
