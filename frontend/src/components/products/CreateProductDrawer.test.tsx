import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth: { token: string; company: { id: string; settings: unknown }; hasPermission: () => boolean } = {
  token: 'tok',
  company: { id: 'tenant-1', settings: {} },
  hasPermission: () => true,
};
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CreateProductDrawer } from './CreateProductDrawer';

/** The sale-price currency select's trigger (label → its field). */
function salePriceCurrencyTrigger(): HTMLElement {
  const label = screen.getByText('Sotish narxi valyutasi');
  const field = label.parentElement as HTMLElement;
  return field.querySelector('button') as HTMLElement;
}

describe('CreateProductDrawer sale-price currency (plan Task 1 Step 5)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue([]);
  });

  it('starts a new product in the tenant sales default currency', async () => {
    auth.company = { id: 'tenant-1', settings: { sales: { defaultCurrency: 'USD' } } };
    renderPage(<CreateProductDrawer isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(salePriceCurrencyTrigger().textContent).toContain('USD'));
  });

  it('leaves the currency blank, not USD, when the tenant has no sales default', async () => {
    auth.company = { id: 'tenant-1', settings: { accounting: { defaultCurrency: 'USD' } } };
    renderPage(<CreateProductDrawer isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(salePriceCurrencyTrigger().textContent).toContain('Valyutani tanlang'));
    expect(salePriceCurrencyTrigger().textContent).not.toContain('USD');
  });

  it('leaves an unresolved legacy price blank when editing', async () => {
    auth.company = { id: 'tenant-1', settings: { sales: { defaultCurrency: 'UZS' } } };
    renderPage(
      <CreateProductDrawer
        isOpen
        onClose={vi.fn()}
        productToEdit={{ id: 'p1', name: 'Shampun', salePrice: 5000, salePriceCurrency: null }}
      />,
    );
    await waitFor(() => expect(salePriceCurrencyTrigger().textContent).toContain('Valyutani tanlang'));
  });
});

/** The cost-price currency select's trigger (label → its field). */
function costPriceCurrencyTrigger(): HTMLElement {
  const label = screen.getByText('Xarid tannarxi valyutasi');
  return (label.parentElement as HTMLElement).querySelector('button') as HTMLElement;
}

function costPriceInput(): HTMLInputElement {
  const label = screen.getByText('Xarid narxi (Tan narx)');
  return (label.parentElement as HTMLElement).querySelector('input') as HTMLInputElement;
}

function postedProductBodies(): Array<Record<string, unknown>> {
  return apiFetch.mock.calls
    .filter(([path, options]) => path === '/inventory/products' && (options as { method?: string })?.method === 'POST')
    .map(([, options]) => JSON.parse((options as { body: string }).body));
}

describe('CreateProductDrawer cost-price currency (F8, ADR 0022)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string, options?: { method?: string }) =>
      Promise.resolve(options?.method === 'POST' ? { id: 'p-new', name: { uz: 'Shampun' } } : []),
    );
    auth.company = { id: 'tenant-1', settings: {} };
  });

  it('starts a new product with a blank cost-price currency, not UZS', async () => {
    renderPage(<CreateProductDrawer isOpen onClose={vi.fn()} initialSkuOrBarcode="Shampun" />);
    await waitFor(() => expect(costPriceCurrencyTrigger().textContent).toContain('Valyutani tanlang'));
    expect(costPriceCurrencyTrigger().textContent).not.toContain('UZS');
  });

  it('refuses to save a nonzero cost price until a currency is chosen', async () => {
    renderPage(<CreateProductDrawer isOpen onClose={vi.fn()} initialSkuOrBarcode="Shampun" />);
    fireEvent.change(costPriceInput(), { target: { value: '5000' } });
    fireEvent.click(screen.getByText('Tovarni saqlash (Ctrl+Enter)'));
    await waitFor(() => expect(screen.getByText('Xarid tannarxi valyutasini tanlang')).toBeTruthy());
    expect(postedProductBodies()).toEqual([]);
  });

  it('saves the cost price in the chosen currency', async () => {
    renderPage(<CreateProductDrawer isOpen onClose={vi.fn()} initialSkuOrBarcode="Shampun" />);
    fireEvent.change(costPriceInput(), { target: { value: '5000' } });
    fireEvent.click(costPriceCurrencyTrigger());
    fireEvent.click(await screen.findByRole('option', { name: 'UZS' }));
    fireEvent.click(screen.getByText('Tovarni saqlash (Ctrl+Enter)'));
    await waitFor(() => expect(postedProductBodies()).toHaveLength(1));
    expect(postedProductBodies()[0]).toMatchObject({ costPrice: 5000, costPriceCurrency: 'UZS', costPriceExchangeRate: 1 });
  });
});
