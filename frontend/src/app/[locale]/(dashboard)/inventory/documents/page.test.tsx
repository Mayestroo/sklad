import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import InventoryDocumentsPage from './page';

const documents = [
  {
    id: 'd1',
    docNumber: 'INV-0001',
    docType: 'INBOUND',
    status: 'POSTED',
    totalAmount: 1000,
    createdAt: '2026-11-01',
    warehouse: { name: { uz: 'Asosiy ombor', ru: 'Главный склад' } },
    items: [],
  },
];

function respond(endpoint: string): unknown {
  if (endpoint === '/inventory/documents') return documents;
  return [];
}
const calls = () => apiFetch.mock.calls.map((c) => c[0] as string);

describe('Inventory documents page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads documents, products and warehouses once each', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => respond(endpoint));
    renderPage(<InventoryDocumentsPage />);

    expect(await screen.findByText('INV-0001')).toBeTruthy();
    expect(calls().sort()).toEqual(['/inventory/documents', '/inventory/products', '/tenants/warehouses']);
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/inventory/documents' && fail) throw new Error('Server error');
      return respond(endpoint);
    });
    renderPage(<InventoryDocumentsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('INV-0001')).toBeTruthy();
    await waitFor(() => expect(calls().filter((e) => e === '/inventory/documents')).toHaveLength(2));
  });
});
