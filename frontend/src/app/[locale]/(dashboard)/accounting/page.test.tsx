import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const roles: string[] = [];
const auth = {
  token: 'tok',
  company: { id: 'tenant-1' },
  user: { id: 'u1' },
  hasRole: (r: string) => roles.includes(r),
  hasPermission: () => true,
};
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));

import AccountingPage from './page';

const card = (value: number, previous = 0) => ({ value, previous, parts: [] });
const summary = {
  currency: 'UZS',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-26',
  hasData: true,
  cards: {
    money: card(120_000_000, 100_000_000),
    receivables: card(5_000_000),
    payables: card(3_000_000),
    inventory: card(40_000_000),
    profit: { ...card(12_000_000), revenue: 80_000_000, expenses: 68_000_000 },
    netWorth: card(162_000_000),
  },
  cardAccounts: { money: ['5010'], receivables: ['4010'], payables: ['6010'], inventory: ['2910'] },
  health: { ok: true, checkedAt: '2026-11-26T10:00:00.000Z', issues: [] },
  recent: [],
};
const tb = {
  periodStart: '2026-11-01',
  periodEnd: '2026-11-26',
  currency: 'UZS',
  totalDebitTurnover: 100,
  totalCreditTurnover: 100,
  items: [
    { accountId: 'a1', accountCode: '5010', accountName: { uz: 'Milliy valyutadagi kassa', ru: 'Касса' }, accountAlias: { uz: 'Kassa (so‘m)', ru: 'Касса (сум)' }, accountType: 'ASSET', isTechnical: false, openingBalance: 50, debitTurnover: 100, creditTurnover: 0, closingBalance: 150 },
    { accountId: 'a0', accountCode: '00', accountName: { uz: 'Yordamchi', ru: 'Вспом.' }, accountAlias: null, accountType: 'EQUITY', isTechnical: true, openingBalance: 0, debitTurnover: 0, creditTurnover: 0, closingBalance: 0 },
  ],
};

function route(endpoint: string) {
  if (endpoint.startsWith('/accounting/summary')) return Promise.resolve(summary);
  if (endpoint.startsWith('/accounting/trial-balance')) return Promise.resolve(tb);
  return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 5 });
}

describe('Accounting overview page', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    // The first-visit intro is covered elsewhere; keep it out of the way.
    window.localStorage.setItem('sklad.ui.accounting.intro.u1', 'true');
    roles.length = 0;
    apiFetch.mockReset();
  });

  it('opens in the simple mode with the banner, six cards and the period of this month', async () => {
    apiFetch.mockImplementation(route);
    renderPage(<AccountingPage />);

    expect(await screen.findByText('banner.ok')).toBeTruthy();
    for (const key of ['money', 'receivables', 'payables', 'inventory', 'profit', 'netWorth']) {
      expect(screen.getByText(`cards.${key}`)).toBeTruthy();
    }
    expect(screen.getByText('120 units.million')).toBeTruthy();
    const [endpoint] = apiFetch.mock.calls[0];
    expect(endpoint).toMatch(/^\/accounting\/summary\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/);
  });

  it('opens a card’s composition in a side panel', async () => {
    apiFetch.mockImplementation(route);
    renderPage(<AccountingPage />);
    const open = await screen.findAllByRole('button', { name: /cards\.open/ });
    fireEvent.click(open[0]);
    expect(await screen.findByText('cards.composition')).toBeTruthy();
  });

  it('shows the problems banner with a list behind it', async () => {
    apiFetch.mockImplementation((endpoint: string) =>
      endpoint.startsWith('/accounting/summary')
        ? Promise.resolve({ ...summary, health: { ok: false, checkedAt: summary.health.checkedAt, issues: [{ code: 'NEGATIVE_CASH', severity: 'error', params: { code: '5010', nameUz: 'Kassa', nameRu: 'Касса', balance: -5 }, href: '/accounting/journal?account=5010' }] } })
        : route(endpoint),
    );
    renderPage(<AccountingPage />);
    fireEvent.click(await screen.findByRole('button', { name: /banner\.issues/ }));
    expect(await screen.findByText('issue.NEGATIVE_CASH_fix')).toBeTruthy();
    expect(screen.getByText(/banner\.fix/)).toBeTruthy();
  });

  it('shows the full trial balance for an accountant and keeps the technical account out of the default view', async () => {
    roles.push('accountant');
    apiFetch.mockImplementation(route);
    renderPage(<AccountingPage />);

    expect(await screen.findByText('Milliy valyutadagi kassa')).toBeTruthy();
    expect(screen.queryByText('Yordamchi')).toBeNull();
    expect(apiFetch.mock.calls[0][0]).toMatch(/^\/accounting\/trial-balance\?from=/);
  });

  it('switches the mode without reloading and remembers it', async () => {
    apiFetch.mockImplementation(route);
    renderPage(<AccountingPage />);
    await screen.findByText('banner.ok');
    fireEvent.click(screen.getByRole('radio', { name: 'mode.accountant' }));
    expect(await screen.findByText('Milliy valyutadagi kassa')).toBeTruthy();
    expect(window.localStorage.getItem('sklad.ui.accounting.mode.u1')).toBe('"accountant"');
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<AccountingPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockImplementation(route);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('banner.ok')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  it('shows the first-visit intro until it is dismissed', async () => {
    window.localStorage.removeItem('sklad.ui.accounting.intro.u1');
    apiFetch.mockImplementation(route);
    renderPage(<AccountingPage />);
    expect(screen.getByText('help.step1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'help.skip' }));
    expect(screen.queryByText('help.step1')).toBeNull();
  });
});
