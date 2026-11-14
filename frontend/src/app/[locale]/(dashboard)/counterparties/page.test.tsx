import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useDefaultCurrency', () => ({ useDefaultCurrency: () => 'UZS' }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/counterparties/CreateCounterpartyDrawer', () => ({ CreateCounterpartyDrawer: () => null }));
vi.mock('@/components/counterparties/QuickPaymentModal', () => ({ QuickPaymentModal: () => null }));
vi.mock('@/components/counterparties/AktSverkaDrawer', () => ({ AktSverkaDrawer: () => null }));

import CounterpartiesPage from './page';

const LIST = '/sales/counterparties?folderId=all';
const counterparty = (name: string) => ({
  id: name, name, type: 'CUSTOMER', phone: '+998901234567', balances: [], folderId: null,
});

function routes(listFails: () => boolean = () => false) {
  apiFetch.mockImplementation((url: string) => {
    if (url === '/sales/counterparties/summary') {
      return Promise.resolve({
        total_customers: 1, total_suppliers: 0,
        receivables: { count: 0, total_amount: 0 }, payables: { count: 0, total_amount: 0 },
      });
    }
    if (url === '/sales/counterparties/folders') {
      return Promise.resolve({ folders: [], unassignedCount: 0, totalCount: 1 });
    }
    if (url === LIST) return listFails() ? Promise.reject(new Error('Server error')) : Promise.resolve([counterparty('Mijoz MChJ')]);
    if (url === '/sales/counterparties?search=Javox&folderId=all') return Promise.resolve([counterparty('Javox-BRO LLC')]);
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;
const listCalls = () => apiFetch.mock.calls.filter(([u]) => String(u).startsWith('/sales/counterparties?')).length;

describe('Counterparties page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the list, folders and summary once', async () => {
    routes();
    renderPage(<CounterpartiesPage />);

    expect(await screen.findByText('Mijoz MChJ')).toBeTruthy();
    // wait past the 300 ms search debounce: no second request
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listCalls()).toBe(1);
    expect(callsTo('/sales/counterparties/summary')).toBe(1);
    expect(callsTo('/sales/counterparties/folders')).toBe(1);
    expect(apiFetch).toHaveBeenCalledWith(LIST, expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }));
  });

  it('searches once after typing stops', async () => {
    routes();
    renderPage(<CounterpartiesPage />);
    await screen.findByText('Mijoz MChJ');

    const input = screen.getByPlaceholderText('Nomi, STIR, telefon...');
    fireEvent.change(input, { target: { value: 'Jav' } });
    fireEvent.change(input, { target: { value: 'Javox' } });

    expect(await screen.findByText('Javox-BRO LLC')).toBeTruthy();
    expect(callsTo('/sales/counterparties?search=Javox&folderId=all')).toBe(1);
    expect(listCalls()).toBe(2);
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    routes(() => fail);
    renderPage(<CounterpartiesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Mijoz MChJ')).toBeTruthy();
    await waitFor(() => expect(callsTo(LIST)).toBe(2));
  });
});
