import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrencyInput, formatCurrencyValue } from './CurrencyInput';

/**
 * D9 (owner, option b): number inputs drop trailing zeros so `1.000` is not
 * read as one thousand. The typing grammar is unchanged: dot decimal, comma
 * groups while typing.
 */
describe('CurrencyInput number text (D9)', () => {
  it('drops trailing zeros and keeps the needed decimals', () => {
    expect(formatCurrencyValue(1, 3)).toBe('1');
    expect(formatCurrencyValue(0, 3)).toBe('0');
    expect(formatCurrencyValue(1000, 3)).toBe('1,000');
    expect(formatCurrencyValue(1.5, 3)).toBe('1.5');
    expect(formatCurrencyValue(1.25, 2)).toBe('1.25');
    expect(formatCurrencyValue(2.1234, 3)).toBe('2.123');
    expect(formatCurrencyValue('abc', 3)).toBe('0');
  });

  it('shows 1 (not 1.000) for one unit and 0 as the placeholder', () => {
    render(<CurrencyInput value={1} onChange={() => {}} decimals={3} aria-label="qty" />);
    const input = screen.getByLabelText('qty') as HTMLInputElement;
    expect(input.value).toBe('1');
    expect(input.placeholder).toBe('0');
  });

  it('keeps the typing grammar: dot decimal, comma groups, value reported as a number', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={0} onChange={onChange} decimals={2} aria-label="price" />);
    const input = screen.getByLabelText('price') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12345.5' } });
    expect(input.value).toBe('12,345.5');
    expect(onChange).toHaveBeenLastCalledWith(12345.5);
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(12345.5);
  });
});
