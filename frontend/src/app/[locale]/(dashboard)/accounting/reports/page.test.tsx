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

import FinancialReportsPage from './page';

const statements = {
  currency: 'UZS',
  balanceSheet: { totalAssets: 1250000, totalLiabilities: 250000, totalEquity: 1000000 },
  profitLoss: { totalRevenue: 900000, totalCogs: 600000, grossProfit: 300000, netProfit: 280000 },
};
const NB = String.fromCharCode(0xa0);

describe('Financial reports page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the statements once and shows them in the local money format', async () => {
    apiFetch.mockResolvedValue(statements);
    renderPage(<FinancialReportsPage />);

    expect(screen.getByText('loading')).toBeTruthy();
    await waitFor(() =>
      expect(document.body.textContent).toContain(`1${NB}250${NB}000${NB}UZS`),
    );
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/accounting/reports/statements',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Forbidden'));
    renderPage(<FinancialReportsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Forbidden');

    apiFetch.mockResolvedValueOnce(statements);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    await waitFor(() =>
      expect(document.body.textContent).toContain(`1${NB}250${NB}000${NB}UZS`),
    );
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
