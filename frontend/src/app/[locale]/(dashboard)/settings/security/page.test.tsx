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

import SecurityPage from './page';

const logs = [
  {
    id: 'l1',
    action: 'UPDATE',
    entityType: 'AccountingPeriod',
    entityId: 'p1',
    ipAddress: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    user: { firstName: 'Ali', lastName: 'Valiyev' },
  },
];

describe('Security page (audit log)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the audit log once', async () => {
    apiFetch.mockResolvedValue(logs);
    renderPage(<SecurityPage />);

    expect(screen.getByText('loading')).toBeTruthy();
    expect(await screen.findByText('AccountingPeriod', { exact: false })).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/audit-logs',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Not allowed'));
    renderPage(<SecurityPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Not allowed');

    apiFetch.mockResolvedValueOnce(logs);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('AccountingPeriod', { exact: false })).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
