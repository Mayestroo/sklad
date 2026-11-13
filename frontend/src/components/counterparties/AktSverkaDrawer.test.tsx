import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));

import { AktSverkaDrawer } from './AktSverkaDrawer';

const statement = (name: string) => ({
  counterparty: { id: name, name, type: 'CUSTOMER', balancesByCurrency: [] },
  summary: {
    balancesByCurrency: [], salesInvoicedByCurrency: [], purchasesInvoicedByCurrency: [],
    totalSalesInvoiced: 0, totalPurchasesInvoiced: 0, totalTransactionsCount: 0,
  },
  transactions: [],
});
const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;

describe('AktSverkaDrawer', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the statement once when opened, and nothing while closed', async () => {
    apiFetch.mockResolvedValue(statement('Mijoz MChJ'));
    const { rerender, queryClient } = renderPage(<AktSverkaDrawer isOpen={false} counterpartyId="c1" onClose={() => {}} />);
    expect(apiFetch).not.toHaveBeenCalled();

    rerender(
      <QueryClientProvider client={queryClient}>
        <AktSverkaDrawer isOpen counterpartyId="c1" onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect((await screen.findAllByText('Mijoz MChJ')).length).toBeGreaterThan(0);
    expect(callsTo('/sales/counterparties/c1/statement')).toBe(1);
  });

  it('never shows the previous counterparty while the next one loads', async () => {
    apiFetch.mockImplementation((url: string) =>
      url === '/sales/counterparties/c1/statement' ? Promise.resolve(statement('Mijoz MChJ')) : new Promise(() => {}),
    );
    const { rerender, queryClient } = renderPage(<AktSverkaDrawer isOpen counterpartyId="c1" onClose={() => {}} />);
    await screen.findAllByText('Mijoz MChJ');

    rerender(
      <QueryClientProvider client={queryClient}>
        <AktSverkaDrawer isOpen counterpartyId="c2" onClose={() => {}} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(callsTo('/sales/counterparties/c2/statement')).toBe(1));
    expect(screen.queryByText('Mijoz MChJ')).toBeNull();
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<AktSverkaDrawer isOpen counterpartyId="c1" onClose={() => {}} />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(statement('Mijoz MChJ'));
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect((await screen.findAllByText('Mijoz MChJ')).length).toBeGreaterThan(0);
    expect(callsTo('/sales/counterparties/c1/statement')).toBe(2);
  });
});
