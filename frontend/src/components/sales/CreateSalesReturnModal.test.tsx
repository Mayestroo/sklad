import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CreateSalesReturnModal } from './CreateSalesReturnModal';
import type { SalesInvoice } from '@shared/types';

const invoice = {
  id: 'i1', invoiceNumber: 'INV-0007', counterpartyId: 'c1', warehouseId: 'w1',
  currency: 'UZS', exchangeRate: 1, totalAmount: 201.6, items: [],
} as unknown as SalesInvoice;

describe('CreateSalesReturnModal (plan T3.6)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((url: string) => {
      if (url === '/tenants/warehouses') return Promise.resolve([{ id: 'w1', name: { uz: 'Asosiy ombor' } }]);
      if (url === '/sales/invoices/i1/returnable-items') {
        return Promise.resolve([{
          productId: 'p1', productName: { uz: 'Shampun' }, sku: 'SH-1',
          soldQuantity: 2, returnedQuantity: 0, returnableQuantity: 2,
          unitPrice: 90, discount: 10, vatRate: 12, unitVatAmount: 10.8, unitTotalPrice: 100.8,
        }]);
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
  });

  it("shows the source line's discount and VAT and a VAT-inclusive total", async () => {
    renderPage(<CreateSalesReturnModal isOpen onClose={vi.fn()} invoice={invoice} onSuccess={vi.fn()} />);

    const row = (await screen.findByText('Shampun')).closest('tr') as HTMLElement;
    expect(row.textContent).toContain('-10,0%');
    expect(row.textContent).toContain('12%');

    fireEvent.change(row.querySelector('input[type="number"]') as HTMLInputElement, { target: { value: '2' } });

    const banner = screen.getByText('Jami qaytariladigan summa:').parentElement?.parentElement as HTMLElement;
    await waitFor(() => expect(banner.textContent).toMatch(/201,6/));
    expect(banner.textContent).toMatch(/Shundan QQS:\s*21,6/);
  });
});
