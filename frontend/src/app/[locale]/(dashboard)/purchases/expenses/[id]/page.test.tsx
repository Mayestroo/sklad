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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ id: 'e1' }) }));
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ExpenseDetailPage from './page';

const expense = {
  id: 'e1',
  docNumber: 'AE-0001',
  docDate: '2026-11-01',
  expenseType: 'TRANSPORT',
  status: 'DRAFT',
  currency: 'UZS',
  amount: 1000,
  counterparty: { name: 'Logistika MChJ' },
  receiptId: 'r1',
  receipt: { docNumber: 'PR-0001', counterparty: { name: 'Javox' }, warehouse: { name: { uz: 'Ombor' } }, items: [] },
  allocations: [],
};

describe('Additional expense detail page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the expense once', async () => {
    apiFetch.mockResolvedValue(expense);
    renderPage(<ExpenseDetailPage />);

    expect(await screen.findByText('AE-0001')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/purchases/additional-expenses/e1',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<ExpenseDetailPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(expense);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('AE-0001')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
