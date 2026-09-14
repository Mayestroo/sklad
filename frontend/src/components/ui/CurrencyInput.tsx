'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface CurrencyInputProps {
  value: number | string;
  onChange: (value: number) => void;
  decimals?: number;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
  className?: string;
  id?: string;
  'aria-label'?: string;
  title?: string;
}

export function formatCurrencyValue(val: number | string | null | undefined, decimals = 3): string {
  const num = typeof val === 'number' ? val : parseFloat(String(val || 0).replace(/,/g, ''));
  if (isNaN(num)) return `0.${'0'.repeat(decimals)}`;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

function parseCurrencyValue(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/,/g, '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function formatNumberWithCommas(raw: string, maxDecimals: number): { formatted: string; rawNumber: number } {
  if (!raw) return { formatted: '', rawNumber: 0 };

  // Replace comma with dot if user typed comma as decimal separator
  const normalized = raw.replace(/,/g, (match, offset, full) => {
    // If there's already a dot, comma was a thousand separator
    if (full.includes('.')) return '';
    // If it's towards the end and has only 1-3 digits after it, user might have hit comma on numpad
    const afterComma = full.slice(offset + 1);
    if (!afterComma.includes(',') && afterComma.length <= maxDecimals) {
      return '.';
    }
    return '';
  });

  const parts = normalized.split('.');
  const intDigits = parts[0].replace(/[^0-9]/g, '');
  const formattedInt = intDigits ? Number(intDigits).toLocaleString('en-US') : '';

  let formatted = formattedInt;
  if (parts.length > 1) {
    const decDigits = parts[1].replace(/[^0-9]/g, '').slice(0, maxDecimals);
    formatted = `${formattedInt || '0'}.${decDigits}`;
  }

  const rawNum = parseCurrencyValue(formatted);
  return { formatted, rawNumber: rawNum };
}

function getNewCursorPos(oldValue: string, oldCursor: number, newFormatted: string): number {
  const dotIndexOld = oldValue.indexOf('.');
  if (dotIndexOld !== -1 && oldCursor > dotIndexOld) {
    const decOffset = oldCursor - dotIndexOld;
    const dotIndexNew = newFormatted.indexOf('.');
    if (dotIndexNew !== -1) {
      return Math.min(newFormatted.length, dotIndexNew + decOffset);
    }
  }

  const digitsBefore = oldValue.slice(0, oldCursor).replace(/\D/g, '').length;
  let count = 0;
  for (let i = 0; i < newFormatted.length; i++) {
    if (/\d/.test(newFormatted[i])) {
      count++;
      if (count >= digitsBefore) {
        return i + 1;
      }
    }
  }
  return newFormatted.length;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      decimals = 3,
      placeholder = '0.000',
      disabled = false,
      min = 0,
      max,
      style,
      className,
      id,
      'aria-label': ariaLabel,
      title,
    },
    forwardedRef
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [textValue, setTextValue] = useState<string>(() => formatCurrencyValue(value, decimals));

    // When value changes from props and input is NOT focused, sync textValue
    useEffect(() => {
      if (!isFocused) {
        setTextValue(formatCurrencyValue(value, decimals));
      }
    }, [value, decimals, isFocused]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      const formatted = formatCurrencyValue(value, decimals);
      setTextValue(formatted);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.select();
        }
      }, 0);
    };

    const handleBlur = () => {
      setIsFocused(false);
      const num = parseCurrencyValue(textValue);
      const clamped = max !== undefined ? Math.min(max, Math.max(min, num)) : Math.max(min, num);
      onChange(clamped);
      setTextValue(formatCurrencyValue(clamped, decimals));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const oldVal = textValue;
      const cursorPos = e.target.selectionStart || 0;

      const { formatted, rawNumber } = formatNumberWithCommas(raw, decimals);

      setTextValue(formatted);
      const clamped = max !== undefined ? Math.min(max, Math.max(min, rawNumber)) : Math.max(min, rawNumber);
      onChange(clamped);

      // Restore cursor position seamlessly
      setTimeout(() => {
        if (inputRef.current) {
          const newPos = getNewCursorPos(raw, cursorPos, formatted);
          inputRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        inputRef.current?.blur();
      }
    };

    return (
      <input
        ref={(el) => {
          inputRef.current = el;
          if (typeof forwardedRef === 'function') {
            forwardedRef(el);
          } else if (forwardedRef) {
            forwardedRef.current = el;
          }
        }}
        id={id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={isFocused ? textValue : formatCurrencyValue(value, decimals)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={className}
        style={{
          boxSizing: 'border-box',
          height: '38px',
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          backgroundColor: disabled ? 'var(--color-bg-secondary)' : 'var(--color-bg-input)',
          color: 'var(--color-text-primary)',
          outline: 'none',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 'var(--text-sm)',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          cursor: disabled ? 'not-allowed' : 'text',
          width: '100%',
          ...style,
        }}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
