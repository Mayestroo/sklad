'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { caretAfterSignificant, formatDecimalText, sanitizeDecimalText } from '@/lib/decimal-input';

export interface DecimalInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Canonical value ('1234.5') or a number; '' when empty. */
  value: string | number | null | undefined;
  onValueChange: (value: string) => void;
  /** Decimals allowed (3 for quantities, 2 for percents). */
  decimals?: number;
  invalid?: boolean;
}

/**
 * Number field (TZ "Ishlab chiqarish" 11.5): "1 234,5" — thousands grouped
 * with a space as you type, comma decimals, no negative values. Right
 * aligned; reports a canonical string ('1234.5').
 */
export function DecimalInput({ value, onValueChange, decimals = 3, invalid, style, onBlur, ...rest }: DecimalInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  // Typed text; a value set from outside shows formatted again.
  const [draft, setDraft] = useState({ value: String(value ?? ''), text: formatDecimalText(value) });
  const canonical = String(value ?? '');
  const shown = draft.value === canonical ? draft.text : formatDecimalText(canonical);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-invalid={invalid || rest['aria-invalid'] ? true : undefined}
      value={shown}
      onChange={(e) => {
        const raw = e.target.value;
        const position = e.target.selectionStart ?? raw.length;
        const significant = raw.slice(0, position).replace(/\./g, ',').replace(/[^\d,]/g, '').length;
        const next = sanitizeDecimalText(raw, decimals);
        caret.current = caretAfterSignificant(next.text, significant);
        setDraft(next);
        onValueChange(next.value);
      }}
      onBlur={(e) => {
        setDraft({ value: canonical, text: formatDecimalText(canonical) });
        onBlur?.(e);
      }}
      style={{
        width: '100%',
        minHeight: 40,
        padding: '8px 10px',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${invalid ? 'var(--color-error-500)' : 'var(--color-border)'}`,
        background: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
        fontSize: 'var(--text-sm)',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    />
  );
}
