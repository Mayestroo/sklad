import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, user: { id: 'u1' }, hasRole: () => false, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));

import JournalPage from './page';

const entry = {
  id: 'je1',
  entryNumber: 'JE-2026-00001',
  entryDate: '2026-10-15T00:00:00.000Z',
  createdAt: '2026-10-15T00:00:00.000Z',
  description: 'Kassa kirimi: 8000 UZS',
  sourceDocType: 'FinanceTransaction',
  sourceDocId: 'ft1',
  status: 'POSTED',
  reversedOfId: null,
  lines: [
    {
      id: 'l1',
      amount: 8000,
      currency: 'UZS',
      amountOrig: 8000,
      debitAccount: { code: '5010', type: 'ASSET', name: { uz: 'Kassa', ru: 'Касса' } },
      creditAccount: { code: '9390', type: 'REVENUE', name: { uz: 'Daromad', ru: 'Доход' } },
    },
  ],
};
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 50 });

describe('Movements page', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    window.localStorage.setItem('sklad.ui.accounting.intro.u1', 'true');
    apiFetch.mockReset();
  });

  it('loads the period’s movements and reads them in plain words in the simple mode', async () => {
    apiFetch.mockImplementation((endpoint: string) => Promise.resolve(endpoint.startsWith('/accounting/journal') ? page([entry]) : { cardAccounts: { money: ['5010'], receivables: ['4010'], payables: ['6010'], inventory: ['2910'] } }));
    renderPage(<JournalPage />);

    expect(await screen.findByText(/plain\.moneyIn/)).toBeTruthy();
    expect(screen.queryByText(/Kassa kirimi/)).toBeNull();
    const journalCall = apiFetch.mock.calls.find(([e]) => String(e).startsWith('/accounting/journal'));
    expect(journalCall?.[0]).toMatch(/^\/accounting\/journal\?from=.*&to=.*&pageSize=50$/);
  });

  it('shows the entry and its debit/credit lines in the accountant mode', async () => {
    window.localStorage.setItem('sklad.ui.accounting.mode.u1', '"accountant"');
    apiFetch.mockImplementation((endpoint: string) => Promise.resolve(endpoint.startsWith('/accounting/journal') ? page([entry]) : {}));
    renderPage(<JournalPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Kassa kirimi/ }));
    expect(await screen.findByText('journal.debit')).toBeTruthy();
    expect(screen.getByText('5010 · Kassa')).toBeTruthy();
    expect(screen.getByRole('button', { name: /journal\.newEntry/ })).toBeTruthy();
  });

  it('filters by an account from the link (?account=)', async () => {
    window.history.replaceState(null, '', '/?account=5010');
    apiFetch.mockImplementation((endpoint: string) => Promise.resolve(endpoint.startsWith('/accounting/journal') ? page([]) : {}));
    renderPage(<JournalPage />);
    await waitFor(() => expect(apiFetch.mock.calls.some(([e]) => String(e).includes('accountCode=5010'))).toBe(true));
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockImplementation((endpoint: string) => (endpoint.startsWith('/accounting/journal') ? Promise.reject(new Error('Timeout')) : Promise.resolve({})));
    renderPage(<JournalPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Timeout');

    apiFetch.mockImplementation((endpoint: string) => Promise.resolve(endpoint.startsWith('/accounting/journal') ? page([entry]) : {}));
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));
    expect(await screen.findByText(/plain\.moneyIn/)).toBeTruthy();
  });

  it('shows the empty state when the period has no movements', async () => {
    apiFetch.mockImplementation((endpoint: string) => Promise.resolve(endpoint.startsWith('/accounting/journal') ? page([]) : {}));
    renderPage(<JournalPage />);
    expect(await screen.findByText('movements.empty')).toBeTruthy();
  });
});
