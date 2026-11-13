import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  listOf: <T,>(res: T[] | { items: T[] }) => (Array.isArray(res) ? res : res.items),
}));
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
vi.mock('@/components/sales/PaySalesInvoiceModal', () => ({ PaySalesInvoiceModal: () => null }));
vi.mock('@/components/sales/CreateSalesReturnModal', () => ({ CreateSalesReturnModal: () => null }));

import SalesPage from './page';

const invoice = (invoiceNumber: string) => ({
  id: invoiceNumber,
  invoiceNumber,
  invoiceDate: '2026-11-01',
  status: 'DRAFT',
  paymentStatus: 'UNPAID',
  currency: 'UZS',
  totalAmount: 1000,
  paidAmount: 0,
  counterparty: { name: 'Mijoz MChJ' },
  warehouse: { name: { uz: 'Asosiy ombor', ru: 'Главный склад' } },
  items: [],
});

function respond(endpoint: string): unknown {
  if (endpoint === '/sales/invoices?search=INV-9') return [invoice('INV-0009')];
  if (endpoint.startsWith('/sales/invoices')) return [invoice('INV-0001')];
  if (endpoint === '/sales/summary') return { monthlySalesTotal: 0 };
  return [];
}
const invoiceCalls = () =>
  apiFetch.mock.calls.map((c) => c[0] as string).filter((e) => e.startsWith('/sales/invoices'));

describe('Sales invoices page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the invoices once; typed filters apply on the filter button', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => respond(endpoint));
    renderPage(<SalesPage />);

    expect(await screen.findByText('INV-0001')).toBeTruthy();
    expect(apiFetch.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/sales/counterparties',
      '/sales/invoices?',
      '/sales/summary',
      '/tenants/warehouses',
    ]);

    fireEvent.change(screen.getByPlaceholderText('Qidirish uchun faktura raqami yoki izohni kiriting...'), {
      target: { value: 'INV-9' },
    });
    expect(invoiceCalls()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Filtr' }));
    expect(await screen.findByText('INV-0009')).toBeTruthy();
    expect(invoiceCalls()).toEqual(['/sales/invoices?', '/sales/invoices?search=INV-9']);
  });

  it('shows the error and reloads on retry', async () => {
    let fail = true;
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/sales/invoices') && fail) throw new Error('Server error');
      return respond(endpoint);
    });
    renderPage(<SalesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('INV-0001')).toBeTruthy();
    await waitFor(() => expect(invoiceCalls()).toHaveLength(2));
  });
});
