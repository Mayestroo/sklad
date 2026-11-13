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

import PricesPage from './page';

const priceLists = [
  { id: 'pl1', name: { uz: 'Chakana', ru: 'Розница' }, currency: 'UZS', isDefault: true, isActive: true, prices: [] },
  { id: 'pl2', name: { uz: 'Ulgurji', ru: 'Опт' }, currency: 'UZS', isDefault: false, isActive: true, prices: [] },
];
const products = [{ id: 'p1', name: { uz: 'Shampun' }, sku: 'SH-1', salePrice: 1000, costPrice: 600 }];

function routes(failPriceLists: () => boolean = () => false) {
  apiFetch.mockImplementation((url: string) => {
    if (url === '/sales/price-lists') {
      return failPriceLists() ? Promise.reject(new Error('Server error')) : Promise.resolve(priceLists);
    }
    if (url === '/inventory/products') return Promise.resolve(products);
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;
const isActiveTab = (id: string) => (document.getElementById(`pl-tab-${id}`) as HTMLElement).style.fontWeight === '600';

describe('Prices page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    sessionStorage.clear();
  });

  it('loads the price lists and products once and selects the default list', async () => {
    routes();
    renderPage(<PricesPage />);

    expect(await screen.findByText('Shampun')).toBeTruthy();
    await screen.findByRole('button', { name: /Chakana/ });
    expect(callsTo('/sales/price-lists')).toBe(1);
    expect(callsTo('/inventory/products')).toBe(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/sales/price-lists',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
    expect(isActiveTab('pl1')).toBe(true);
  });

  it('restores the price list chosen earlier in this session', async () => {
    sessionStorage.setItem('sklad_selected_price_list_id', 'pl2');
    routes();
    renderPage(<PricesPage />);

    await screen.findByRole('button', { name: /Ulgurji/ });
    expect(isActiveTab('pl2')).toBe(true);
    expect(isActiveTab('pl1')).toBe(false);
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    routes(() => fail);
    renderPage(<PricesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByRole('button', { name: /Chakana/ })).toBeTruthy();
    await waitFor(() => expect(callsTo('/sales/price-lists')).toBe(2));
  });
});
