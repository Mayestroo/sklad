import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next-intl', () => ({ useLocale: () => 'uz' }));

import { QuantityInput } from './QuantityInput';
import { MoneyInput } from './MoneyInput';

describe('QuantityInput', () => {
  it('shows the unit of the product in the user language, inside the field', () => {
    render(<QuantityInput unit="kg" value={1250.5} onValueChange={() => {}} aria-label="Miqdor" />);
    expect(screen.getByTestId('quantity-unit').textContent).toBe('kg');
    const input = screen.getByLabelText('Miqdor, kg') as HTMLInputElement;
    expect(input.value).toBe('1,250.5');
  });

  it('a piece unit reads "dona" and a custom unit is shown as typed', () => {
    const { rerender } = render(<QuantityInput unit="piece" value={3} onValueChange={() => {}} />);
    expect(screen.getByTestId('quantity-unit').textContent).toBe('dona');
    rerender(<QuantityInput unit="qop" value={3} onValueChange={() => {}} />);
    expect(screen.getByTestId('quantity-unit').textContent).toBe('qop');
  });

  it('reports typed numbers as text and an emptied field as empty', () => {
    const onValueChange = vi.fn();
    render(<QuantityInput unit="liter" value="" onValueChange={onValueChange} aria-label="q" />);
    const input = screen.getByLabelText('q, litr');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1500' } });
    expect(onValueChange).toHaveBeenLastCalledWith('1500');
    fireEvent.change(input, { target: { value: '' } });
    expect(onValueChange).toHaveBeenLastCalledWith('');
  });
});

describe('MoneyInput', () => {
  it('an emptied exchange rate stays empty instead of becoming 0 (ADR 0022)', () => {
    const onValueChange = vi.fn();
    render(<MoneyInput aria-label="Kurs" value="12800" onValueChange={onValueChange} decimals={4} />);
    const input = screen.getByLabelText('Kurs') as HTMLInputElement;
    expect(input.value).toBe('12,800');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(onValueChange).toHaveBeenLastCalledWith('');
    fireEvent.blur(input);
    expect(onValueChange).not.toHaveBeenCalledWith('0');
  });
});
