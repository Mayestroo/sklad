import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
// Super-admin with no company selected: platform data must still load.
const auth = { token: 'tok', company: null, user: { roles: ['super_admin'] }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SuperAdminBillingPage from './page';

const ENDPOINT = '/super-admin/tenants';
const rows = [{ id: 't1', name: { uz: 'Javox-BRO LLC', ru: 'Javox-BRO LLC' }, slug: 'javox', status: 'ACTIVE', plan: 'STARTER', userCount: 3, createdAt: '2026-10-01', trialEndsAt: null }];
const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;

describe('Super-admin Billing page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads once without a company and without a tenant header', async () => {
    apiFetch.mockResolvedValue(rows);
    renderPage(<SuperAdminBillingPage />);

    expect(await screen.findByText('Javox-BRO LLC')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({ token: 'tok' }));
    expect(apiFetch.mock.calls[0][1].tenantId).toBeUndefined();
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<SuperAdminBillingPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(rows);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Javox-BRO LLC')).toBeTruthy();
    await waitFor(() => expect(callsTo(ENDPOINT)).toBe(2));
  });
});
