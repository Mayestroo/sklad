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
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/products/CreateProductDrawer', () => ({ CreateProductDrawer: () => null }));

import InventoryPage from './page';

const product = (name: string) => ({
  id: name,
  name: { uz: name, ru: name },
  sku: `SKU-${name}`,
  unit: 'piece',
  costPrice: 100,
  salePrice: 150,
  currency: 'UZS',
  totalStock: 5,
  stockLevels: [],
  isLowStock: false,
});

function respond(endpoint: string): unknown {
  if (endpoint.startsWith('/inventory/products?search=un')) return [product('Un 1-nav')];
  if (endpoint.startsWith('/inventory/products?')) return [product('Shakar')];
  return [];
}
const calls = () => apiFetch.mock.calls.map((c) => c[0] as string);

describe('Inventory page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads products, categories, warehouses and alerts once; search applies on Enter only', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => respond(endpoint));
    renderPage(<InventoryPage />);

    expect(await screen.findByText('Shakar')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(4);
    expect(calls().sort()).toEqual([
      '/inventory/categories',
      '/inventory/products/low-stock',
      '/inventory/products?',
      '/tenants/warehouses',
    ]);

    const searchBox = screen.getByPlaceholderText("SKU, Shtrix-kod bo'yicha qidiruv...");
    fireEvent.change(searchBox, { target: { value: 'un' } });
    expect(apiFetch).toHaveBeenCalledTimes(4);

    fireEvent.keyDown(searchBox, { key: 'Enter' });
    expect(await screen.findByText('Un 1-nav')).toBeTruthy();
    expect(calls()).toContain('/inventory/products?search=un');
    expect(apiFetch).toHaveBeenCalledTimes(5);
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/tenants/warehouses' && fail) throw new Error('Server error');
      return respond(endpoint);
    });
    renderPage(<InventoryPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Shakar')).toBeTruthy();
    await waitFor(() => expect(calls().filter((e) => e === '/tenants/warehouses')).toHaveLength(2));
  });
});
