import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
let locale: 'uz' | 'ru' = 'uz';
vi.mock('next-intl', () => ({ useLocale: () => locale, useTranslations: () => (key: string) => key }));

import { CreateReturnModal } from './CreateReturnModal';
import type { PurchaseReceipt } from '@shared/types';

const receiptA = {
  id: 'rc-a', counterpartyId: 's1', warehouseId: 'w1', currency: 'UZS',
  items: [
    { productId: 'p1', quantity: 10, returnedQuantity: 0, unitPrice: 1000, landedCost: 10000, vatRate: 12, product: { name: { uz: 'Shampun', ru: 'Шампунь' } } },
    { productId: 'p2', quantity: 4, returnedQuantity: 1, unitPrice: 500, landedCost: 2000, vatRate: 0, product: { name: { uz: 'Sovun', ru: 'Мыло' } } },
  ],
} as unknown as PurchaseReceipt;
const receiptB = {
  ...receiptA,
  id: 'rc-b',
  items: [{ productId: 'p3', quantity: 2, returnedQuantity: 0, unitPrice: 300, landedCost: 600, vatRate: 12, product: { name: { uz: 'Krem', ru: 'Крем' } } }],
} as unknown as PurchaseReceipt;

/** Re-render inside the same query provider, so the modal is updated, not remounted. */
function rerenderIn(view: ReturnType<typeof renderPage>, ui: ReactElement) {
  view.rerender(<QueryClientProvider client={view.queryClient}>{ui}</QueryClientProvider>);
}

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
const inputsOf = (row: HTMLElement) => Array.from(row.querySelectorAll('input[type="number"]')) as HTMLInputElement[];

describe('Purchase CreateReturnModal', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    locale = 'uz';
  });

  it('keeps typed quantities and VAT when the language is switched', () => {
    const view = renderPage(<CreateReturnModal isOpen onClose={vi.fn()} receipt={receiptA} onSuccess={vi.fn()} />);

    const [qty, vat] = inputsOf(rowOf('Shampun'));
    fireEvent.change(qty, { target: { value: '3' } });
    fireEvent.change(vat, { target: { value: '0' } });

    locale = 'ru';
    rerenderIn(view, <CreateReturnModal isOpen onClose={vi.fn()} receipt={receiptA} onSuccess={vi.fn()} />);

    const [qtyRu, vatRu] = inputsOf(rowOf('Шампунь'));
    expect(qtyRu.value).toBe('3');
    expect(vatRu.value).toBe('0');
  });

  it('keeps typed quantities when the same receipt is reloaded', () => {
    const view = renderPage(<CreateReturnModal isOpen onClose={vi.fn()} receipt={receiptA} onSuccess={vi.fn()} />);
    fireEvent.change(inputsOf(rowOf('Shampun'))[0], { target: { value: '2' } });

    rerenderIn(view, <CreateReturnModal isOpen onClose={vi.fn()} receipt={{ ...receiptA } as PurchaseReceipt} onSuccess={vi.fn()} />);

    expect(inputsOf(rowOf('Shampun'))[0].value).toBe('2');
  });

  it('starts from zero for another receipt and caps at the unreturned quantity', () => {
    const view = renderPage(<CreateReturnModal isOpen onClose={vi.fn()} receipt={receiptA} onSuccess={vi.fn()} />);
    fireEvent.change(inputsOf(rowOf('Sovun'))[0], { target: { value: '9' } });
    expect(inputsOf(rowOf('Sovun'))[0].value).toBe('3');

    rerenderIn(view, <CreateReturnModal isOpen onClose={vi.fn()} receipt={receiptB} onSuccess={vi.fn()} />);

    expect(inputsOf(rowOf('Krem'))[0].value).toBe('0');
  });
});
