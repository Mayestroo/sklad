import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrencyInput, formatCurrencyValue } from './CurrencyInput';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
}));

const S = ' '; // group separator, the same as in shared/format/money.ts

/** Types text one character at a time, like a person at a keyboard. */
function typeChars(input: HTMLInputElement, text: string) {
  for (const ch of text) {
    const next = input.value + ch;
    fireEvent.change(input, { target: { value: next }, nativeEvent: { inputType: 'insertText' } });
  }
}

/**
 * D9 (owner, option b): number inputs drop trailing zeros so `1,000` is not
 * read as one thousand. The field text now matches the rest of the app
 * (`15 000,5`), and typing accepts both `15,000.5` and `15.000,5`.
 */
describe('CurrencyInput number text (D9 + one format)', () => {
  it('drops trailing zeros and keeps the needed decimals, in the app format', () => {
    expect(formatCurrencyValue(1, 3)).toBe('1');
    expect(formatCurrencyValue(0, 3)).toBe('0');
    expect(formatCurrencyValue(1000, 3)).toBe(`1${S}000`);
    expect(formatCurrencyValue(1.5, 3)).toBe('1,5');
    expect(formatCurrencyValue(1.25, 2)).toBe('1,25');
    expect(formatCurrencyValue(2.1234, 3)).toBe('2,123');
    expect(formatCurrencyValue('abc', 3)).toBe('0');
  });

  it('an unset amount stays empty (placeholder visible) and is not turned into 0 on blur', () => {
    expect(formatCurrencyValue('', 2)).toBe('');
    expect(formatCurrencyValue(null, 2)).toBe('');
    const onChange = vi.fn();
    render(<CurrencyInput value="" onChange={onChange} decimals={2} aria-label="amount" />);
    const input = screen.getByLabelText('amount') as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('shows 1 (not 1,000) for one unit and 0 as the placeholder', () => {
    render(<CurrencyInput value={1} onChange={() => {}} decimals={3} aria-label="qty" />);
    const input = screen.getByLabelText('qty') as HTMLInputElement;
    expect(input.value).toBe('1');
    expect(input.placeholder).toBe('0');
  });

  it('typed "15,000.5" shows "15 000,5" and reports the number 15000.5', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CurrencyInput value={0} onChange={onChange} decimals={2} aria-label="price" />);
    const input = screen.getByLabelText('price') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' }, nativeEvent: { inputType: 'deleteContentBackward' } });
    typeChars(input, '15,000.5');
    expect(input.value).toBe(`15${S}000,5`);
    expect(onChange).toHaveBeenLastCalledWith(15000.5);
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(15000.5);
    rerender(<CurrencyInput value={15000.5} onChange={onChange} decimals={2} aria-label="price" />); // the parent stores the number
    expect(input.value).toBe(`15${S}000,5`);
  });

  it('typed the Russian way, "15.000,5", is the same number', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value="" onChange={onChange} decimals={2} aria-label="price" />);
    const input = screen.getByLabelText('price') as HTMLInputElement;
    fireEvent.focus(input);
    typeChars(input, '15.000,5');
    expect(onChange).toHaveBeenLastCalledWith(15000.5);
    expect(input.value).toBe(`15${S}000,5`);
  });

  it('editing a shown value never changes its size (old bug: "15,000" minus one 0 became 15)', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={15000} onChange={onChange} decimals={3} aria-label="sum" />);
    const input = screen.getByLabelText('sum') as HTMLInputElement;
    fireEvent.focus(input);
    expect(input.value).toBe(`15${S}000`);
    fireEvent.change(input, { target: { value: `15${S}00` }, nativeEvent: { inputType: 'deleteContentBackward' } });
    expect(onChange).toHaveBeenLastCalledWith(1500);
  });

  it('typing "1,500" digit by digit in a 3-decimal field is a decimal being typed (1.5), with no note', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value="" onChange={onChange} decimals={3} aria-label="qty" />);
    const input = screen.getByLabelText('qty') as HTMLInputElement;
    fireEvent.focus(input);
    typeChars(input, '1,500');
    expect(onChange).toHaveBeenLastCalledWith(1.5);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('pasted "15,000" in a 3-decimal field is read as thousands, says so, and offers the decimal reading', () => {
    let current: number | string = '';
    const onChange = vi.fn((v: number) => { current = v; });
    const { rerender } = render(<CurrencyInput value={current} onChange={onChange} decimals={3} aria-label="sum" />);
    const input = screen.getByLabelText('sum') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.paste(input);
    fireEvent.change(input, { target: { value: '15,000' }, nativeEvent: { inputType: 'insertFromPaste' } });
    rerender(<CurrencyInput value={current} onChange={onChange} decimals={3} aria-label="sum" />);
    expect(onChange).toHaveBeenLastCalledWith(15000);
    expect(input.value).toBe(`15${S}000`);
    const note = screen.getByRole('status');
    expect(note.textContent).toContain('readAsThousands');
    expect(note.textContent).toContain('15,000');
    fireEvent.click(screen.getByRole('button', { name: /itWasDecimal/ }));
    expect(onChange).toHaveBeenLastCalledWith(15);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('pasted "15,000" in a 2-decimal money field is simply 15000 (three decimals impossible), no note', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value="" onChange={onChange} decimals={2} aria-label="price" />);
    const input = screen.getByLabelText('price') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.paste(input);
    fireEvent.change(input, { target: { value: '15,000' }, nativeEvent: { inputType: 'insertFromPaste' } });
    expect(onChange).toHaveBeenLastCalledWith(15000);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('still reports plain numbers and respects min / max (payload unchanged)', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value="" onChange={onChange} decimals={2} min={0} max={100} aria-label="pct" />);
    const input = screen.getByLabelText('pct') as HTMLInputElement;
    fireEvent.focus(input);
    typeChars(input, '250');
    expect(onChange).toHaveBeenLastCalledWith(100);
    expect(typeof onChange.mock.calls.at(-1)?.[0]).toBe('number');
  });
});
