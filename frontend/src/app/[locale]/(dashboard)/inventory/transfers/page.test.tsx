import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' } };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import StockTransfersPage from './page';

const transfers = [
  {
    id: 't1',
    transferNumber: 'TR-0001',
    transferDate: '2026-11-01',
    status: 'DRAFT',
    sourceWarehouse: { name: { uz: 'Asosiy ombor', ru: 'Главный склад' } },
    targetWarehouse: { name: { uz: 'Filial ombori', ru: 'Склад филиала' } },
    items: [],
  },
];

function respond(endpoint: string): unknown {
  if (endpoint === '/inventory/transfers') return transfers;
  return [];
}
const calls = () => apiFetch.mock.calls.map((c) => c[0] as string);

describe('Stock transfers page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads transfers, warehouses and products once each', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => respond(endpoint));
    renderPage(<StockTransfersPage />);

    expect(await screen.findByText('TR-0001')).toBeTruthy();
    expect(calls().sort()).toEqual(['/inventory/products', '/inventory/transfers', '/tenants/warehouses']);
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/inventory/transfers' && fail) throw new Error('Server error');
      return respond(endpoint);
    });
    renderPage(<StockTransfersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('TR-0001')).toBeTruthy();
    await waitFor(() => expect(calls().filter((e) => e === '/inventory/transfers')).toHaveLength(2));
  });
});
