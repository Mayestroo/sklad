import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
// Super-admin with no company selected: platform data must still load.
const auth = { token: 'tok', company: null, startImpersonation: vi.fn(), hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SuperAdminTenantsPage from './page';

const tenant = {
  id: 't1', name: { uz: 'Javox-BRO LLC', ru: 'Javox-BRO LLC' }, slug: 'javox', status: 'ACTIVE',
  plan: 'STARTER', userCount: 3, createdAt: '2026-10-01', trialEndsAt: null,
};
const metrics = { mrrByCurrency: [{ currency: 'UZS', amount: 0 }], activeTenantsCount: 7, trialTenantsCount: 2, totalUsersCount: 31 };

function routes(tenantsFail: () => boolean = () => false) {
  apiFetch.mockImplementation((url: string) => {
    if (url === '/super-admin/metrics') return Promise.resolve(metrics);
    if (url === '/super-admin/tenants') {
      return tenantsFail() ? Promise.reject(new Error('Server error')) : Promise.resolve([tenant]);
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}
const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;

describe('Super-admin tenants page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads metrics and tenants once without a tenant header', async () => {
    routes();
    renderPage(<SuperAdminTenantsPage />);

    expect(await screen.findByText('Javox-BRO LLC')).toBeTruthy();
    expect(await screen.findByText('31')).toBeTruthy();
    expect(callsTo('/super-admin/metrics')).toBe(1);
    expect(callsTo('/super-admin/tenants')).toBe(1);
    for (const [, options] of apiFetch.mock.calls) expect(options.tenantId).toBeUndefined();
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    routes(() => fail);
    renderPage(<SuperAdminTenantsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Javox-BRO LLC')).toBeTruthy();
    await waitFor(() => expect(callsTo('/super-admin/tenants')).toBe(2));
  });
});

describe('Super-admin MRR card (ADR 0022 / 0023)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  function withMetrics(m: unknown) {
    apiFetch.mockImplementation((url: string) => {
      if (url === '/super-admin/metrics') return Promise.resolve(m);
      if (url === '/super-admin/tenants') return Promise.resolve([tenant]);
      return Promise.reject(new Error(`unexpected ${url}`));
    });
  }
  const mrrCard = async () => (await screen.findByText('Oylik daromad (MRR)')).closest('[data-mrr-card]') as HTMLElement;

  it('shows one amount per currency, each with its own code', async () => {
    withMetrics({ ...metrics, mrrByCurrency: [{ currency: 'UZS', amount: 350000 }, { currency: 'USD', amount: 30 }] });
    renderPage(<SuperAdminTenantsPage />);

    const card = await mrrCard();
    await waitFor(() => expect(card.textContent).toMatch(/350\s000\sUZS/));
    expect(card.textContent).toMatch(/30,00\sUSD/);
  });

  it('shows an explicit error instead of assuming USD when the currency is missing', async () => {
    withMetrics({ totalMrr: 500, activeTenantsCount: 7, trialTenantsCount: 2, totalUsersCount: 31 });
    renderPage(<SuperAdminTenantsPage />);

    const card = await mrrCard();
    await waitFor(() => expect(card.textContent).toContain("Valyuta ko'rsatilmagan"));
    expect(card.textContent).not.toContain('USD');
    expect(card.textContent).not.toContain('500');
  });

  it('shows an explicit error when one row has no currency', async () => {
    withMetrics({ ...metrics, mrrByCurrency: [{ currency: 'UZS', amount: 1000 }, { amount: 20 }] });
    renderPage(<SuperAdminTenantsPage />);

    const card = await mrrCard();
    await waitFor(() => expect(card.textContent).toContain("Valyuta ko'rsatilmagan"));
    expect(card.textContent).not.toContain('USD');
  });

  it('shows an empty state when there are no active subscriptions', async () => {
    withMetrics({ ...metrics, mrrByCurrency: [] });
    renderPage(<SuperAdminTenantsPage />);

    const card = await mrrCard();
    await waitFor(() => expect(card.textContent).toContain("Faol obuna yo'q"));
  });
});
