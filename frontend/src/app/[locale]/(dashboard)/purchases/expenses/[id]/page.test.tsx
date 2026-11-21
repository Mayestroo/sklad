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

  it('labels landed costs with the receipt currency and the share with the expense currency', async () => {
    // A UZS expense on a USD receipt: 100,000 UZS = 8 USD at 12,500.
    apiFetch.mockResolvedValue({
      ...expense,
      status: 'POSTED',
      amount: 100000,
      receipt: { ...expense.receipt, currency: 'USD' },
      items: [
        {
          id: 'ei-1',
          receiptItemId: 'line-1',
          productId: 'p1',
          product: { name: { uz: 'Kabel' }, sku: 'CAB', unitOfMeasure: 'piece' },
          initialLandedCost: 100,
          allocatedAmount: 100000,
          newLandedCost: 102.67,
          soldQuantity: 0,
          remainingQuantity: 3,
          cogsAdjustment: 0,
          originalCurrency: 'UZS',
          expenseRate: 1,
          receiptRate: 12500,
          rateSource: 'DOCUMENT',
          receiptAmount: 8,
          baseAmount: 100000,
          receiptUnitDelta: 2.67,
          baseUnitDelta: 33333.33,
        },
      ],
    });
    renderPage(<ExpenseDetailPage />);

    const row = (await screen.findByText('Kabel')).closest('tr')!;
    const text = row.textContent ?? '';
    expect(text).toMatch(/100[.,]00\s*USD/); // old landed cost, receipt currency
    expect(text).toMatch(/100\s000\s*UZS/); // the share, expense currency
    expect(text).toMatch(/=\s*8[.,]00\s*USD/); // the same share in USD
    expect(text).toMatch(/\+2[.,]67\s*USD/); // per unit, receipt currency
    expect(text).toMatch(/102[.,]67\s*USD/); // new landed cost
    // The old page labelled the USD landed cost as UZS.
    expect(text).not.toMatch(/100[.,]00\s*UZS/);
  });

  it('asks to recalculate a draft saved before rates were stored, and saves it again', async () => {
    apiFetch.mockResolvedValue({
      ...expense,
      items: [
        {
          id: 'ei-1',
          receiptItemId: 'line-1',
          productId: 'p1',
          product: { name: { uz: 'Kabel' }, sku: 'CAB', unitOfMeasure: 'piece' },
          initialLandedCost: 100,
          allocatedAmount: 1000,
          newLandedCost: 0,
          soldQuantity: 0,
          remainingQuantity: 3,
          cogsAdjustment: 0,
          originalCurrency: null,
        },
      ],
    });
    renderPage(<ExpenseDetailPage />);

    // The draft warning (role=status) appears once the document has loaded.
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((n) => n.textContent?.includes('Qayta hisoblash va saqlash'))).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Qayta hisoblash va saqlash' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/purchases/additional-expenses/e1',
        expect.objectContaining({ method: 'PUT', body: '{}' }),
      ),
    );
  });
});
