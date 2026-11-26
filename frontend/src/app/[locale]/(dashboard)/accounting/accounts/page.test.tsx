import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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

import AccountsPage from './page';

const account = (code: string, extra: Record<string, unknown>) => ({
  id: `acc-${code}`,
  tenantId: 'tenant-1',
  code,
  name: { uz: `Rasmiy ${code}`, ru: `Официальный ${code}` },
  alias: null,
  type: 'ASSET',
  isSystem: true,
  isTechnical: false,
  isActive: true,
  isUsed: true,
  createdAt: '',
  updatedAt: '',
  ...extra,
});
const accounts = [
  account('5020', { alias: { uz: 'Valyuta kassasi', ru: 'Валютная касса' } }),
  account('00', { type: 'EQUITY', isTechnical: true, alias: { uz: 'Texnik hisob', ru: 'Тех' } }),
  account('2920', { isUsed: false, alias: { uz: 'Yo‘ldagi tovar', ru: 'Товары в пути' } }),
];

function route(endpoint: string) {
  if (endpoint === '/accounting/accounts') return Promise.resolve(accounts);
  return Promise.resolve({ items: [], totalDebitTurnover: 0, totalCreditTurnover: 0 });
}

describe('Accounts page', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    window.localStorage.setItem('sklad.ui.accounting.intro.u1', 'true');
    apiFetch.mockReset();
  });

  it('shows only accounts in use by their plain name in the simple mode, official name small', async () => {
    apiFetch.mockImplementation(route);
    renderPage(<AccountsPage />);

    expect(await screen.findByText('Valyuta kassasi')).toBeTruthy();
    expect(screen.getByText('5020 · Rasmiy 5020')).toBeTruthy();
    expect(screen.queryByText('Texnik hisob')).toBeNull();
    expect(screen.queryByText('Yo‘ldagi tovar')).toBeNull();
  });

  it('shows the full chart with the technical mark in the accountant mode', async () => {
    window.localStorage.setItem('sklad.ui.accounting.mode.u1', '"accountant"');
    apiFetch.mockImplementation(route);
    renderPage(<AccountsPage />);

    expect(await screen.findByText('Rasmiy 00')).toBeTruthy();
    expect(screen.getByText('accounts.technical')).toBeTruthy();
    expect(screen.getByText('Rasmiy 2920')).toBeTruthy();
    expect(screen.getByRole('button', { name: /accounts\.add/ })).toBeTruthy();
  });
});
