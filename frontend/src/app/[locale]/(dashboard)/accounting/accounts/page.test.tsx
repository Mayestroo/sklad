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

import ChartOfAccountsPage from './page';

const accounts = [
  { id: 'a1', code: '5010', name: { uz: 'Kassa', ru: 'Касса' }, type: 'ASSET', isActive: true },
  { id: 'a2', code: '6010', name: { uz: 'Yetkazib beruvchilar', ru: 'Поставщики' }, type: 'LIABILITY', isActive: true },
];

describe('Chart of accounts page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the accounts of the current tenant', async () => {
    apiFetch.mockResolvedValue(accounts);
    renderPage(<ChartOfAccountsPage />);

    expect(screen.getByText('loading')).toBeTruthy();
    expect(await screen.findByText('5010')).toBeTruthy();
    expect(screen.getByText('6010')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/accounting/accounts',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1', locale: 'uz' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server down'));
    renderPage(<ChartOfAccountsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Server down');

    apiFetch.mockResolvedValueOnce(accounts);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('5010')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
