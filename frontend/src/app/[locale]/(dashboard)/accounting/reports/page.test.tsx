import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, user: { id: 'u1' }, hasRole: () => false, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));

import ReportsPage from './page';

const pnl = {
  type: 'profit-loss',
  currency: 'UZS',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-26',
  revenue: [{ code: '9010', name: { uz: 'Tovar sotishdan daromad', ru: 'Выручка' }, amount: 80_000_000 }],
  expenses: [{ code: '9110', name: { uz: 'Sotilgan mol tannarxi', ru: 'Себестоимость' }, amount: 68_000_000 }],
  totalRevenue: 80_000_000,
  totalExpenses: 68_000_000,
  netProfit: 12_000_000,
};
const balance = {
  type: 'balance',
  currency: 'UZS',
  periodEnd: '2026-11-26',
  assets: [{ code: '5010', name: { uz: 'Kassa (so‘m)', ru: 'Касса' }, amount: 300 }],
  liabilities: [{ code: '6010', name: { uz: 'Yetkazib beruvchilarga qarz', ru: 'Долг' }, amount: 100 }],
  equity: [{ code: '8710', name: { uz: 'Yig‘ilgan foyda', ru: 'Прибыль' }, amount: 200 }],
  totalAssets: 300,
  totalLiabilities: 100,
  totalEquity: 200,
  isBalanced: true,
};

describe('Reports page', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    window.localStorage.setItem('sklad.ui.accounting.intro.u1', 'true');
    apiFetch.mockReset();
  });

  it('opens on income and expenses with a one-sentence summary and the export', async () => {
    apiFetch.mockResolvedValue(pnl);
    renderPage(<ReportsPage />);

    expect(await screen.findByText('reports.pnlProfit')).toBeTruthy();
    expect(screen.getByText('Tovar sotishdan daromad')).toBeTruthy();
    expect(screen.getByRole('button', { name: /export\.excel/ })).toBeTruthy();
    expect(apiFetch.mock.calls[0][0]).toMatch(/^\/accounting\/reports\/profit-loss\?from=/);
  });

  it('switches to assets and debts', async () => {
    apiFetch.mockImplementation((endpoint: string) => Promise.resolve(endpoint.includes('/balance') ? balance : pnl));
    renderPage(<ReportsPage />);
    await screen.findByText('reports.pnlProfit');
    fireEvent.click(screen.getByRole('button', { name: /reports\.balance/ }));
    expect(await screen.findByText('reports.balanceSummary')).toBeTruthy();
    expect(screen.getByText('reports.balanced')).toBeTruthy();
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<ReportsPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('Server error');
    apiFetch.mockResolvedValueOnce(pnl);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));
    expect(await screen.findByText('reports.pnlProfit')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
