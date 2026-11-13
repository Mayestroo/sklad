import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, updateCompanySettings: vi.fn() };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));

import SalesSettingsPage from './page';

const settings = { sales: { enableMultiTierPriceLists: true, allowSellerPriceOverride: false } };
const multiTier = () => document.querySelector('#enable-multitier') as HTMLInputElement;

describe('Sales settings page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the settings once and starts the form from them', async () => {
    apiFetch.mockResolvedValue(settings);
    renderPage(<SalesSettingsPage />);

    expect(await screen.findByText('Savdo sozlamalari')).toBeTruthy();
    expect(multiTier().checked).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/tenants/settings',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('keeps what the user changed when the settings are fetched again', async () => {
    apiFetch.mockResolvedValue(settings);
    const { queryClient } = renderPage(<SalesSettingsPage />);
    await screen.findByText('Savdo sozlamalari');

    fireEvent.click(multiTier());
    expect(multiTier().checked).toBe(false);

    await queryClient.invalidateQueries();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(multiTier().checked).toBe(false);
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<SalesSettingsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(settings);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Savdo sozlamalari')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
