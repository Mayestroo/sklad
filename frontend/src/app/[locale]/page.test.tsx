import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import DashboardPage from './page';

const dashboard = (counterpartyName: string) => ({
  finance: { summaryByCurrency: [], accounts: [], summaryByAccount: [], profit: { grossProfit: 0, revenue: 0 } },
  sales: { totalSales: 0, invoiceCount: 0, byCurrency: [], dynamics: [] },
  debts: {
    receivable: { total: 0, count: 0, byCurrency: [], topDebtors: [] },
    payable: { total: 0, count: 0, byCurrency: [], topCreditors: [] },
  },
  cashFlow: { seriesByCurrency: [] },
  recentTransactions: [{
    id: 'tx1', direction: 'INCOME', amount: 1000, currency: 'UZS', transactionDate: '2026-11-01',
    counterparty: { name: counterpartyName },
  }],
});

const dashboardCalls = () => apiFetch.mock.calls.filter(([u]) => String(u).startsWith('/dashboard?'));
const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;

function routes(handler: (url: string) => Promise<unknown>) {
  apiFetch.mockImplementation((url: string) => {
    if (url === '/dashboard/sales-orders') return Promise.resolve({ pipeline: {} });
    if (url.startsWith('/dashboard?')) return handler(url);
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

describe('Dashboard page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the dashboard and the order pipeline once', async () => {
    routes(() => Promise.resolve(dashboard('Mijoz MChJ')));
    renderPage(<DashboardPage />);

    expect(await screen.findByText('Mijoz MChJ')).toBeTruthy();
    expect(dashboardCalls()).toHaveLength(1);
    expect(dashboardCalls()[0][0]).toContain('granularity=day');
    expect(dashboardCalls()[0][1]).toEqual(expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }));
    expect(callsTo('/dashboard/sales-orders')).toBe(1);
  });

  it('keeps the current numbers on screen while another period loads', async () => {
    let finishToday: (value: unknown) => void = () => {};
    routes((url) => {
      if (dashboardCalls().length === 1) return Promise.resolve(dashboard('Mijoz MChJ'));
      expect(url).not.toBe(dashboardCalls()[0][0]);
      return new Promise((resolve) => { finishToday = resolve; });
    });
    renderPage(<DashboardPage />);
    await screen.findByText('Mijoz MChJ');

    fireEvent.click(screen.getByRole('button', { name: 'Bugun' }));
    await waitFor(() => expect(dashboardCalls()).toHaveLength(2));
    expect(screen.getByText('Mijoz MChJ')).toBeTruthy();

    finishToday(dashboard('Javox-BRO LLC'));
    expect(await screen.findByText('Javox-BRO LLC')).toBeTruthy();
    expect(screen.queryByText('Mijoz MChJ')).toBeNull();
  });

  it('reloads on the refresh button', async () => {
    routes(() => Promise.resolve(dashboard('Mijoz MChJ')));
    renderPage(<DashboardPage />);
    await screen.findByText('Mijoz MChJ');

    fireEvent.click(screen.getByRole('button', { name: /Yangilash/ }));
    await waitFor(() => expect(dashboardCalls()).toHaveLength(2));
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    routes(() => (fail ? Promise.reject(new Error('Server error')) : Promise.resolve(dashboard('Mijoz MChJ'))));
    renderPage(<DashboardPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Mijoz MChJ')).toBeTruthy();
    expect(dashboardCalls()).toHaveLength(2);
  });
});
