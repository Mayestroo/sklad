import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useDefaultCurrency', () => ({ useDefaultCurrency: () => 'UZS' }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SalesReturnsPage from './page';

const salesReturn = {
  id: 'r1',
  returnNumber: 'SR-0001',
  returnDate: '2026-11-01',
  counterpartyId: 'c1',
  warehouseId: 'w1',
  counterparty: { id: 'c1', name: 'Mijoz MChJ' },
  warehouse: { id: 'w1', name: { uz: 'Asosiy ombor' } },
  invoice: { id: 'i1', invoiceNumber: 'INV-0007', totalAmount: 5000 },
  totalAmount: 5000,
  totalCogs: 3000,
  currency: 'UZS',
  status: 'DRAFT',
  items: [],
};
const invoice = {
  id: 'i1', invoiceNumber: 'INV-0007', counterpartyId: 'c1', warehouseId: 'w1',
  totalAmount: 5000, currency: 'UZS', exchangeRate: 1,
};
const returnable = [{
  productId: 'p1', productName: { uz: 'Shampun' }, sku: 'SH-1', barcode: '111', unit: 'dona',
  soldQuantity: 3, returnedQuantity: 0, returnableQuantity: 3, unitPrice: 1000, unitTotalPrice: 1000,
}];

function routes(overrides: Record<string, () => Promise<unknown>> = {}) {
  apiFetch.mockImplementation((url: string) => {
    if (overrides[url]) return overrides[url]();
    if (url === '/sales/returns') return Promise.resolve([salesReturn]);
    if (url === '/sales/counterparties') return Promise.resolve([{ id: 'c1', name: 'Mijoz MChJ' }]);
    if (url === '/tenants/warehouses') {
      return Promise.resolve([
        { id: 'w1', name: { uz: 'Asosiy ombor' } },
        { id: 'w2', name: { uz: 'Brak ombori' }, isDefect: true },
      ]);
    }
    if (url === '/sales/invoices?status=POSTED') return Promise.resolve([invoice]);
    if (url === '/sales/invoices/i1/returnable-items') return Promise.resolve(returnable);
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;

describe('Sales returns page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the returns and the reference lists once', async () => {
    routes();
    renderPage(<SalesReturnsPage />);

    expect(await screen.findByText('SR-0001')).toBeTruthy();
    await waitFor(() => expect(callsTo('/sales/invoices?status=POSTED')).toBe(1));
    expect(callsTo('/sales/returns')).toBe(1);
    expect(callsTo('/sales/counterparties')).toBe(1);
    expect(callsTo('/tenants/warehouses')).toBe(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/sales/returns',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    routes({
      '/sales/returns': () => (fail ? Promise.reject(new Error('Server error')) : Promise.resolve([salesReturn])),
    });
    renderPage(<SalesReturnsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('SR-0001')).toBeTruthy();
    expect(callsTo('/sales/returns')).toBe(2);
  });

  it('loads the returnable items once when an invoice is chosen', async () => {
    routes();
    renderPage(<SalesReturnsPage />);
    await screen.findByText('SR-0001');
    await waitFor(() => expect(callsTo('/sales/invoices?status=POSTED')).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: /Yangi qaytarish/i }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Asl sotuv hujjati *' }));
    fireEvent.click(await screen.findByRole('option', { name: /INV-0007/ }));

    expect(await screen.findByText('Shampun')).toBeTruthy();
    expect(callsTo('/sales/invoices/i1/returnable-items')).toBe(1);
  });

  it('totals a return with VAT and shows the source discount (plan T3.6)', async () => {
    routes({
      '/sales/invoices/i1/returnable-items': () =>
        Promise.resolve([{
          productId: 'p1', productName: { uz: 'Shampun' }, sku: 'SH-1', barcode: '111', unit: 'dona',
          soldQuantity: 2, returnedQuantity: 0, returnableQuantity: 2,
          unitPrice: 90, discount: 10, vatRate: 12, unitVatAmount: 10.8, unitTotalPrice: 100.8,
        }]),
    });
    renderPage(<SalesReturnsPage />);
    await screen.findByText('SR-0001');
    await waitFor(() => expect(callsTo('/sales/invoices?status=POSTED')).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: /Yangi qaytarish/i }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Asl sotuv hujjati *' }));
    fireEvent.click(await screen.findByRole('option', { name: /INV-0007/ }));
    const row = (await screen.findByText('Shampun')).closest('tr') as HTMLElement;
    expect(row.textContent).toContain('-10,0%');

    fireEvent.change(row.querySelector('input[type="number"]') as HTMLInputElement, { target: { value: '2' } });

    const footer = (await screen.findByText('Jami qaytariladigan summa:')).closest('tr') as HTMLElement;
    // 2 x (90 net + 10.80 VAT) = 201.60, not the VAT-free 180.
    await waitFor(() => expect(footer.textContent).toMatch(/201,6/));
  });
});
