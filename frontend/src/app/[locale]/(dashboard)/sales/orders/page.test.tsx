import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = {
  token: 'tok',
  company: { id: 'tenant-1', name: { uz: 'Test', ru: 'Test' } },
  hasRole: () => false,
  hasPermission: () => true,
};
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => async () => true }));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/sales/SalesOrderForm', () => ({
  ORDER_STATUS_LABELS: { NEW: { uz: 'Yangi', ru: 'Новый', variant: 'info' } },
}));
vi.mock('@/components/sales/PaySalesOrderModal', () => ({ PaySalesOrderModal: () => null }));
vi.mock('@/components/sales/OrderPickListModal', () => ({ OrderPickListModal: () => null }));
vi.mock('@/components/sales/OrderDeliveryNoteModal', () => ({ OrderDeliveryNoteModal: () => null }));

import SalesOrdersPage from './page';

const order = {
  id: 'o1',
  orderNumber: 'Z-2026-0007',
  status: 'NEW',
  paymentStatus: 'UNPAID',
  currency: 'UZS',
  totalAmount: 8000,
  paidAmount: 0,
  orderDate: '2026-10-15T00:00:00.000Z',
  counterparty: { id: 'cp1', name: 'Mijoz' },
  items: [],
};

function respond(failOrders: boolean) {
  apiFetch.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('/sales/orders/stats')) return Promise.resolve({});
    if (endpoint.startsWith('/sales/orders')) {
      return failOrders
        ? Promise.reject(new Error('Gateway timeout'))
        : Promise.resolve({ data: [order], total: 1 });
    }
    return Promise.resolve([]);
  });
}

const ordersCalls = () =>
  apiFetch.mock.calls.filter(
    ([endpoint]) => String(endpoint).startsWith('/sales/orders?'),
  );

describe('Sales orders page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the orders once with a stable query (no refetch loop)', async () => {
    respond(false);
    renderPage(<SalesOrdersPage />);

    expect(await screen.findByText('Z-2026-0007')).toBeTruthy();
    // give any accidental effect loop a chance to fire
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ordersCalls()).toHaveLength(1);
    expect(ordersCalls()[0][0]).toMatch(/^[/]sales[/]orders[?]take=[0-9]+$/);
    expect(ordersCalls()[0][1]).toEqual(
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    respond(true);
    renderPage(<SalesOrdersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Gateway timeout');

    respond(false);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Z-2026-0007')).toBeTruthy();
    await waitFor(() => expect(ordersCalls()).toHaveLength(2));
  });
});
