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
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import BillingSettingsPage from './page';

const plans = [
  { id: 'STARTER', name: { uz: 'Boshlang‘ich tarif', ru: 'Стартовый' }, priceMonthly: 100000, priceYearly: 1000000, features: [] },
];
const status = { plan: 'STARTER', status: 'TRIAL', daysRemaining: 9, nextBillingAt: null };
const history = [{ id: 'p1', paymentNumber: 'PAY-0001', amount: 100000, status: 'PAID', method: 'CLICK', createdAt: '2026-11-01' }];

function respond(endpoint: string): unknown {
  if (endpoint === '/billing/plans') return plans;
  if (endpoint === '/billing/status') return status;
  return history;
}

describe('Billing settings page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads plans, status and history once each', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => respond(endpoint));
    renderPage(<BillingSettingsPage />);

    expect(await screen.findByText('Boshlang‘ich tarif')).toBeTruthy();
    expect(screen.getByText('PAY-0001')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(apiFetch.mock.calls.map((c) => c[0]).sort()).toEqual(['/billing/history', '/billing/plans', '/billing/status']);
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/billing/status' && fail) throw new Error('Server error');
      return respond(endpoint);
    });
    renderPage(<BillingSettingsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Boshlang‘ich tarif')).toBeTruthy();
    await waitFor(() =>
      expect(apiFetch.mock.calls.filter((c) => c[0] === '/billing/status')).toHaveLength(2),
    );
  });
});
