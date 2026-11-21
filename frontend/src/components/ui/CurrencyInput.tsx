'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-input';

export interface CurrencyInputProps {
  value: number | string;
  onChange: (value: number) => void;
  /**
   * Called instead of onChange(0) when the user empties the field, so a value
   * that must be typed (an exchange rate, ADR 0022) stays empty, not 0.
   */
  onClear?: () => void;
  decimals?: number;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  autoWidth?: boolean;
  minWidthCh?: number;
  style?: React.CSSProperties;
  className?: string;
  id?: string;
  'aria-label'?: string;
  title?: string;
  autoFocus?: boolean;
}

/**
 * Text of a number in an input — the same text as everywhere else in the app
 * (`15 000,5`: non-breaking-space groups, comma decimal), at most `decimals`
 * places and no trailing zeros (D9: `1`, not `1,000`). Typing accepts both
 * `15,000.5` and `15.000,5`; see `lib/money-input.ts` for the rules.
 */
export function formatCurrencyValue(val: number | string | null | undefined, decimals = 3): string {
  return formatMoneyInput(val, decimals);
}

/** Cursor after the same number of digits as before (and after the decimal comma if it was just typed). */
function getNewCursorPos(oldValue: string, oldCursor: number, newText: string): number {
  const before = oldValue.slice(0, oldCursor);
  const digitsBefore = before.replace(/\D/g, '').length;
  const justTypedSeparator = /[.,]$/.test(before);
  if (digitsBefore === 0) return justTypedSeparator ? Math.min(newText.length, newText.indexOf(',') + 1 || newText.length) : 0;
  let count = 0;
  for (let i = 0; i < newText.length; i++) {
    if (/\d/.test(newText[i])) {
      count++;
      if (count >= digitsBefore) {
        if (justTypedSeparator && newText[i + 1] === ',') return i + 2;
        return i + 1;
      }
    }
  }
  return newText.length;
}

/** After an ambiguous paste ("15,000"): how it was read, and the other reading one click away. */
interface AmbiguousNote {
  raw: string;
  asDecimal: { text: string; value: number };
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      onClear,
      decimals = 3,
      placeholder = '0',
      disabled = false,
      min = 0,
      max,
      autoWidth = false,
      minWidthCh = 13,
      style,
      className,
      id,
      'aria-label': ariaLabel,
      title,
      autoFocus,
    },
    forwardedRef
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [textValue, setTextValue] = useState<string>(() => formatCurrencyValue(value, decimals));
    const [note, setNote] = useState<AmbiguousNote | null>(null);
    const tm = useTranslations('rd.money');
    const pastedRef = useRef(false);

    // When value changes from props and input is NOT focused, sync textValue
    useEffect(() => {
      if (!isFocused) {
        setTextValue(formatCurrencyValue(value, decimals));
      }
    }, [value, decimals, isFocused]);

    const displayValue = isFocused ? textValue : formatCurrencyValue(value, decimals);
    const charLen = displayValue ? displayValue.length : (placeholder ? placeholder.length : 5);
    const dynamicCh = autoWidth ? Math.max(minWidthCh, charLen + 4) : Math.max(0, charLen + 3);

    const handleFocus = () => {
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
      // Focusing and leaving an empty field must not turn it into 0.
      if (textValue.trim() === '' && (value === '' || value === null || value === undefined)) return;
      if (textValue.trim() === '' && onClear) {
        onClear();
        return;
      }
      // The field text is what the person sees; read it back the same way (never re-guess an ambiguity here).
      const num = parseMoneyInput(textValue, decimals).value ?? 0;
      const clamped = clampValue(num);
      onChange(clamped);
      setTextValue(formatCurrencyValue(clamped, decimals));
    };

    const clampValue = (n: number) => (max !== undefined ? Math.min(max, Math.max(min, n)) : Math.max(min, n));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      // Typed one character at a time, "15,000" is a decimal being typed. Arriving at once
      // (paste, autofill) it is read as thousands, and the note below says so (explicit, not silent).
      const inputType = (e.nativeEvent as InputEvent | undefined)?.inputType;
      const pasted = pastedRef.current || inputType === 'insertFromPaste' || inputType === 'insertFromDrop' || (!inputType && raw.length - textValue.length > 1);
      pastedRef.current = false;
      const parsed = parseMoneyInput(raw, decimals, pasted ? 'grouped' : 'decimal');
      if (pasted && parsed.reading === 'ambiguous') {
        const asDecimal = parseMoneyInput(raw, decimals, 'decimal');
        setNote({ raw: raw.trim(), asDecimal: { text: asDecimal.text, value: asDecimal.value ?? 0 } });
      } else {
        setNote(null);
      }

      setTextValue(parsed.text);
      if (parsed.text === '' && onClear) {
        onClear();
        return;
      }
      onChange(clampValue(parsed.value ?? 0));

      // Restore cursor position seamlessly
      setTimeout(() => {
        if (inputRef.current && document.activeElement === inputRef.current) {
          const newPos = getNewCursorPos(raw, cursorPos, parsed.text);
          inputRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    };

    const applyDecimalReading = () => {
      if (!note) return;
      const clamped = clampValue(note.asDecimal.value);
      onChange(clamped);
      setTextValue(formatCurrencyValue(clamped, decimals));
      setNote(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        inputRef.current?.blur();
      }
    };

    return (
      <>
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
        autoFocus={autoFocus}
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
        onPaste={() => { pastedRef.current = true; }}
        onKeyDown={handleKeyDown}
        className={className}
        style={{
          boxSizing: 'border-box',
          height: '38px',
          padding: '6px 10px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          backgroundColor: disabled ? 'var(--color-bg-secondary)' : 'var(--color-bg-input)',
          color: 'var(--color-text-primary)',
          outline: 'none',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 'var(--text-sm)',
          position: 'relative',
          zIndex: isFocused ? 5 : 1,
          borderColor: isFocused ? 'var(--color-primary-500, #3b82f6)' : (style?.borderColor || 'var(--color-border)'),
          boxShadow: isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.15)' : undefined,
          transition:
            'border-color var(--transition-fast), box-shadow var(--transition-fast), width 0.2s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: disabled ? 'not-allowed' : 'text',
          width: autoWidth ? `${dynamicCh}ch` : `max(100%, ${dynamicCh}ch)`,
          minWidth: autoWidth ? `${dynamicCh}ch` : undefined,
          ...style,
        }}
      />
      {note && (
        <span role="status" className="money-note">
          {tm('readAsThousands', { raw: note.raw, value: formatCurrencyValue(value, decimals) })}{' '}
          <button type="button" className="rd-linkbtn" onMouseDown={(e) => e.preventDefault()} onClick={applyDecimalReading}>
            {tm('itWasDecimal', { value: note.asDecimal.text })}
          </button>
        </span>
      )}
      </>
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
