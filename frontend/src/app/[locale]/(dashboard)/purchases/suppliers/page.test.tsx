import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' } };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useDefaultCurrency', () => ({ useDefaultCurrency: () => 'UZS' }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/purchases/SupplierProfileDrawer', () => ({ SupplierProfileDrawer: () => null }));
vi.mock('@/components/counterparties/CreateCounterpartyDrawer', () => ({
  CreateCounterpartyDrawer: () => null,
}));

import SuppliersPage from './page';

const counterparties = [
  { id: 's1', name: 'Javox-BRO LLC', type: 'SUPPLIER', inn: '301234567' },
  { id: 'c1', name: 'Faqat mijoz', type: 'CUSTOMER' },
  { id: 'b1', name: 'Ikkalasi MChJ', type: 'BOTH' },
];

describe('Suppliers page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads counterparties once and lists suppliers only (SUPPLIER and BOTH)', async () => {
    apiFetch.mockResolvedValue(counterparties);
    renderPage(<SuppliersPage />);

    expect(await screen.findByText('Javox-BRO LLC')).toBeTruthy();
    expect(screen.getByText('Ikkalasi MChJ')).toBeTruthy();
    expect(screen.queryByText('Faqat mijoz')).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/sales/counterparties',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<SuppliersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(counterparties);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Javox-BRO LLC')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
