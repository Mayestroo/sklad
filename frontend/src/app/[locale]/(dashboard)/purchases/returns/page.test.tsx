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
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/purchases/returns',
}));
vi.mock('@/components/purchases/ReturnActModal', () => ({ ReturnActModal: () => null }));
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PurchaseReturnsPage from './page';

const ret = (returnNumber: string) => ({
  id: returnNumber,
  returnNumber,
  returnDate: '2026-11-01',
  status: 'DRAFT',
  currency: 'UZS',
  totalAmount: 1000,
  counterparty: { name: 'Javox-BRO LLC' },
  receipt: { docNumber: 'PR-0001' },
  warehouse: { name: { uz: 'Asosiy ombor' } },
  items: [],
});

describe('Purchase returns page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    window.localStorage.clear();
  });

  it('loads the returns once; the typed search applies once typing pauses', async () => {
    apiFetch.mockImplementation(async (endpoint: string) =>
      endpoint.includes('search=') ? [ret('PRT-0009')] : [ret('PRT-0001')],
    );
    renderPage(<PurchaseReturnsPage />);

    expect(await screen.findByText('PRT-0001')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/purchases/returns',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );

    fireEvent.change(screen.getByPlaceholderText('searchPh'), { target: { value: 'PRT-9' } });
    expect(apiFetch).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('PRT-0009', {}, { timeout: 2000 })).toBeTruthy();
    expect(apiFetch).toHaveBeenLastCalledWith('/purchases/returns?search=PRT-9', expect.anything());
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<PurchaseReturnsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce([ret('PRT-0001')]);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('PRT-0001')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
