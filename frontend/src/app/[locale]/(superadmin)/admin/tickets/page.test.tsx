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

import SuperAdminTicketsPage from './page';

const ENDPOINT = '/super-admin/tickets';
const rows = [{ id: 'k1', tenantId: 't1', companyName: { uz: 'Javox-BRO LLC', ru: 'Javox-BRO LLC' }, subject: 'Hisobot ochilmayapti', status: 'OPEN', priority: 'HIGH', createdAt: '2026-11-01', messages: [] }];
const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;

describe('Super-admin Tickets page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads once without a company and without a tenant header', async () => {
    apiFetch.mockResolvedValue(rows);
    renderPage(<SuperAdminTicketsPage />);

    expect(await screen.findByText('Hisobot ochilmayapti')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({ token: 'tok' }));
    expect(apiFetch.mock.calls[0][1].tenantId).toBeUndefined();
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<SuperAdminTicketsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(rows);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Hisobot ochilmayapti')).toBeTruthy();
    await waitFor(() => expect(callsTo(ENDPOINT)).toBe(2));
  });
});
