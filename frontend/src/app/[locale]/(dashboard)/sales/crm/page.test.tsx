import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' } };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useDefaultCurrency', () => ({ useDefaultCurrency: () => 'UZS' }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CrmKanbanPage from './page';

const board = {
  LEAD: [{ id: 'd1', title: 'Katta buyurtma', amount: 1000, currency: 'UZS', stage: 'LEAD', counterparty: { name: 'Mijoz MChJ' } }],
};

function respond(endpoint: string): unknown {
  if (endpoint === '/sales/deals/kanban') return board;
  return [{ id: 'c1', name: 'Mijoz MChJ' }];
}
const calls = () => apiFetch.mock.calls.map((c) => c[0] as string);

describe('CRM kanban page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the board and counterparties once each', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => respond(endpoint));
    renderPage(<CrmKanbanPage />);

    expect(await screen.findByText('Katta buyurtma')).toBeTruthy();
    expect(calls().sort()).toEqual(['/sales/counterparties', '/sales/deals/kanban']);
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/sales/deals/kanban' && fail) throw new Error('Server error');
      return respond(endpoint);
    });
    renderPage(<CrmKanbanPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Katta buyurtma')).toBeTruthy();
    await waitFor(() => expect(calls().filter((e) => e === '/sales/deals/kanban')).toHaveLength(2));
  });
});
