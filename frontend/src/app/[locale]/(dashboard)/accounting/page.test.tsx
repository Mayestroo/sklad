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
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import AccountingPage from './page';

const osv = {
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  currency: 'UZS',
  totalDebitTurnover: 100,
  totalCreditTurnover: 100,
  items: [
    { accountCode: '5010', accountName: { uz: 'Kassa', ru: 'Касса' }, accountType: 'ASSET', debitTurnover: 100, creditTurnover: 0, closingBalance: 100 },
  ],
};

describe('Accounting overview page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the trial balance once', async () => {
    apiFetch.mockResolvedValue(osv);
    renderPage(<AccountingPage />);

    expect(await screen.findByText('Kassa')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/accounting/reports/osv',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<AccountingPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(osv);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Kassa')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
