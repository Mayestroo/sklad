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
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/products/CreateProductDrawer', () => ({ CreateProductDrawer: () => null }));

import ProductsPage from './page';

const products = [
  {
    id: 'p1',
    name: { uz: 'Un 1-nav', ru: 'Мука 1 сорт' },
    sku: 'UN-1',
    unit: 'kg',
    type: 'GOODS',
    isActive: true,
    costPrice: 100,
    salePrice: 150,
    currency: 'UZS',
    categoryId: null,
  },
];
const calls = () => apiFetch.mock.calls.map((c) => c[0] as string);

describe('Products page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads products and categories once each', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => (endpoint === '/inventory/products' ? products : []));
    renderPage(<ProductsPage />);

    expect(await screen.findByText('Un 1-nav')).toBeTruthy();
    expect(calls().sort()).toEqual(['/inventory/categories', '/inventory/products']);
  });

  it('still lists products when categories fail', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/inventory/categories') throw new Error('nope');
      return products;
    });
    renderPage(<ProductsPage />);

    expect(await screen.findByText('Un 1-nav')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/inventory/products' && fail) throw new Error('Server error');
      return endpoint === '/inventory/products' ? products : [];
    });
    renderPage(<ProductsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Un 1-nav')).toBeTruthy();
    await waitFor(() => expect(calls().filter((e) => e === '/inventory/products')).toHaveLength(2));
  });
});
