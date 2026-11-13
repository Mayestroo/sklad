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
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/purchases/AllocateExpenseModal', () => ({ AllocateExpenseModal: () => null }));
vi.mock('@/components/purchases/CreateReturnModal', () => ({ CreateReturnModal: () => null }));
vi.mock('@/components/purchases/PayPurchaseModal', () => ({ PayPurchaseModal: () => null }));

import PurchasesPage from './page';

const receipt = (docNumber: string) => ({
  id: docNumber,
  docNumber,
  docDate: '2026-11-01',
  status: 'DRAFT',
  currency: 'UZS',
  totalAmount: 1000,
  paidAmount: 0,
  counterparty: { name: 'Javox-BRO LLC' },
  warehouse: { name: { uz: 'Asosiy ombor', ru: 'Главный склад' } },
  items: [],
});

function respond(endpoint: string): unknown {
  if (endpoint === '/purchases/receipts?search=PR-9') return [receipt('PR-0009')];
  if (endpoint.startsWith('/purchases/receipts')) return [receipt('PR-0001')];
  if (endpoint === '/purchases/summary') return { monthlyPurchasesTotal: 0, monthlyPurchasesCount: 0 };
  return [];
}
const receiptCalls = () =>
  apiFetch.mock.calls.map((c) => c[0] as string).filter((e) => e.startsWith('/purchases/receipts'));

describe('Purchases page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the receipts once; typed filters apply on the filter button', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => respond(endpoint));
    renderPage(<PurchasesPage />);

    expect(await screen.findByText('PR-0001')).toBeTruthy();
    expect(receiptCalls()).toEqual(['/purchases/receipts?']);
    expect(apiFetch.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/purchases/receipts?',
      '/purchases/summary',
      '/sales/counterparties',
      '/tenants/warehouses',
    ]);

    fireEvent.change(screen.getByPlaceholderText('Qidirish uchun hujjat raqami, GTD yoki izohni kiriting...'), {
      target: { value: 'PR-9' },
    });
    expect(receiptCalls()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Filtr' }));
    expect(await screen.findByText('PR-0009')).toBeTruthy();
    expect(receiptCalls()).toEqual(['/purchases/receipts?', '/purchases/receipts?search=PR-9']);
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/purchases/receipts') && fail) throw new Error('Server error');
      return respond(endpoint);
    });
    renderPage(<PurchasesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('PR-0001')).toBeTruthy();
    await waitFor(() => expect(receiptCalls()).toHaveLength(2));
  });
});
