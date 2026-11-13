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
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/services/ServiceActDrawer', () => ({ ServiceActDrawer: () => null }));
vi.mock('@/components/services/ServiceActDetailsModal', () => ({ ServiceActDetailsModal: () => null }));
vi.mock('@/components/services/ServiceActPrintView', () => ({ ServiceActPrintView: () => null }));

import ServicesPage from './page';

const page = (actNumber: string) => ({
  total: 1,
  items: [
    {
      id: actNumber,
      actNumber,
      actDate: '2026-11-01',
      type: 'PROVIDED',
      status: 'DRAFT',
      paymentStatus: 'UNPAID',
      currency: 'UZS',
      totalAmount: 1000,
      paidAmount: 0,
      counterparty: { name: 'Mijoz MChJ' },
      items: [],
    },
  ],
});

describe('Services page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the provided acts once and the received acts when that tab is chosen', async () => {
    apiFetch.mockImplementation(async (endpoint: string) =>
      endpoint.includes('type=RECEIVED') ? page('SA-RECEIVED') : page('SA-PROVIDED'),
    );
    renderPage(<ServicesPage />);

    expect(await screen.findByText('SA-PROVIDED')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/services?type=PROVIDED&page=1&limit=20',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );

    fireEvent.click(screen.getByText('Olingan xizmatlar'));
    expect(await screen.findByText('SA-RECEIVED')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<ServicesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(page('SA-PROVIDED'));
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('SA-PROVIDED')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
