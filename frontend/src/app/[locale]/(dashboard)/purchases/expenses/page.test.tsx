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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ExpensesPage from './page';
import { formatCurrency } from '@/lib/utils';

const response = (docNumber: string) => ({
  items: [
    {
      id: docNumber,
      docNumber,
      docDate: '2026-11-01',
      expenseType: 'TRANSPORT',
      status: 'DRAFT',
      currency: 'UZS',
      amount: 1000,
      counterparty: { name: 'Logistika MChJ' },
      receipt: { docNumber: 'PR-0001' },
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  stats: { transport: [{ currency: 'UZS', amount: 1000 }], customs: [], broker: [], all: [{ currency: 'UZS', amount: 1000 }] },
});

describe('Additional expenses page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the first page once and again for a new search', async () => {
    apiFetch.mockImplementation(async (endpoint: string) =>
      endpoint.includes('search=') ? response('AE-0009') : response('AE-0001'),
    );
    renderPage(<ExpensesPage />);

    expect(await screen.findByText('AE-0001')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/purchases/additional-expenses?page=1&limit=20',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );

    fireEvent.change(screen.getByPlaceholderText('Raqam, kontragent, izoh bo‘yicha qidiruv...'), {
      target: { value: 'AE-9' },
    });
    expect(await screen.findByText('AE-0009')).toBeTruthy();
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<ExpensesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(response('AE-0001'));
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('AE-0001')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});

describe('Additional expenses KPI totals (F8, ADR 0023)', () => {
  it('shows one amount per currency instead of a summed, guessed-currency total', async () => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({
      ...response('AE-0001'),
      stats: {
        transport: [{ currency: 'UZS', amount: 500000 }, { currency: 'USD', amount: 100 }],
        customs: [],
        broker: [],
        all: [{ currency: 'UZS', amount: 500000 }, { currency: 'USD', amount: 100 }],
      },
    });
    renderPage(<ExpensesPage />);

    const transportLabel = await screen.findByText('Transport Xarajatlari');
    const card = transportLabel.parentElement as HTMLElement;
    await waitFor(() => expect(card.textContent).toContain(formatCurrency(500000, 'uz', 'UZS')));
    expect(card.textContent).toContain(formatCurrency(100, 'uz', 'USD'));
    expect(card.textContent).not.toContain(formatCurrency(500100, 'uz', 'UZS'));

    const customsCard = screen.getByText('Bojxona To‘lovlari').parentElement as HTMLElement;
    expect(customsCard.textContent).toContain('—');
  });
});
