import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  listOf: (res: unknown) => (Array.isArray(res) ? res : ((res as { items?: unknown[] })?.items ?? [])),
}));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));

import { PartialDispatchModal } from './PartialDispatchModal';
import type { SalesOrderDetail } from './order-form/types';

const order = {
  id: 'o1', orderNumber: 'SO-0001', status: 'CONFIRMED', createdAt: '2026-11-01', counterpartyId: 'c1',
  warehouseId: 'w1', currency: 'UZS',
  items: [{ id: 'i1', productId: 'p1', quantity: 5, shippedQty: 0, product: { name: { uz: 'Shampun' }, sku: 'SH-1' } }],
} as unknown as SalesOrderDetail;

const STOCK_W1 = '/inventory/products/stock-levels?warehouseId=w1';
const STOCK_W2 = '/inventory/products/stock-levels?warehouseId=w2';
const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;

function routes(stockFails: () => boolean = () => false) {
  apiFetch.mockImplementation((url: string) => {
    if (url === '/tenants/warehouses') {
      return Promise.resolve([{ id: 'w1', name: { uz: 'Asosiy ombor' } }, { id: 'w2', name: { uz: 'Filial ombori' } }]);
    }
    if (url === STOCK_W1) {
      return stockFails() ? Promise.reject(new Error('Server error')) : Promise.resolve([{ productId: 'p1', quantity: 37, reservedQuantity: 0 }]);
    }
    if (url === STOCK_W2) return Promise.resolve([{ productId: 'p1', quantity: 12, reservedQuantity: 0 }]);
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const modal = (isOpen: boolean) => (
  <PartialDispatchModal isOpen={isOpen} onClose={() => {}} order={order} onSuccess={() => {}} />
);

describe('PartialDispatchModal stock', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the stock of the order warehouse once', async () => {
    routes();
    renderPage(modal(true));

    expect(await screen.findByText('37')).toBeTruthy();
    expect(callsTo(STOCK_W1)).toBe(1);
  });

  it('loads the stock again for another warehouse and on the next opening', async () => {
    routes();
    const { rerender, queryClient } = renderPage(modal(true));
    await screen.findByText('37');

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Filial ombori' }));
    expect(await screen.findByText('12')).toBeTruthy();
    expect(callsTo(STOCK_W2)).toBe(1);

    const wrap = (ui: React.ReactElement) => <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
    rerender(wrap(modal(false)));
    rerender(wrap(modal(true)));
    await waitFor(() => expect(callsTo(STOCK_W2) + callsTo(STOCK_W1)).toBeGreaterThan(2));
  });

  it('shows a stock load error with retry', async () => {
    let fail = true;
    routes(() => fail);
    renderPage(modal(true));

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));
    expect(await screen.findByText('37')).toBeTruthy();
  });
});
