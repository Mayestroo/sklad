import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
