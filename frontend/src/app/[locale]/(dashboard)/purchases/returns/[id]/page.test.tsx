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
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'ret-1' }) }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/purchases/PurchaseReturnDocumentForm', () => ({
  PurchaseReturnDocumentForm: ({ initialData }: { initialData: { returnNumber: string } }) => (
    <div>form:{initialData.returnNumber}</div>
  ),
}));

import ViewPurchaseReturnPage from './page';

const returnDoc = { id: 'ret-1', returnNumber: 'PRT-0001' };

describe('Purchase return detail page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the return once and hands it to the form', async () => {
    apiFetch.mockResolvedValue(returnDoc);
    renderPage(<ViewPurchaseReturnPage />);

    expect(await screen.findByText('form:PRT-0001')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/purchases/returns/ret-1',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<ViewPurchaseReturnPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(returnDoc);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('form:PRT-0001')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
