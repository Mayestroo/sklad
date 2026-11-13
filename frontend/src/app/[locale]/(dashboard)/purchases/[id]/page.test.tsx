import { Suspense } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' } };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/purchases/PurchaseDocumentForm', () => ({
  PurchaseDocumentForm: ({ initialData }: { initialData: { receiptNumber: string } }) => (
    <div>form:{initialData.receiptNumber}</div>
  ),
}));

import PurchaseDetailPage from './page';

const receipt = { id: 'r1', receiptNumber: 'PR-0001' };

async function renderDetail() {
  const params = Promise.resolve({ id: 'r1' });
  let result!: ReturnType<typeof renderPage>;
  await act(async () => {
    result = renderPage(
      <Suspense fallback={null}>
        <PurchaseDetailPage params={params} />
      </Suspense>,
    );
  });
  return result;
}

describe('Purchase receipt detail page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the receipt once and hands it to the form', async () => {
    apiFetch.mockResolvedValue(receipt);
    await renderDetail();

    expect(await screen.findByText('form:PR-0001')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/purchases/receipts/r1',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('loads the receipt afresh on every visit (no stale copy for the form)', async () => {
    apiFetch.mockResolvedValue(receipt);
    const first = await renderDetail();
    await screen.findByText('form:PR-0001');
    first.unmount();

    await renderDetail();
    await screen.findByText('form:PR-0001');
    expect(apiFetch).toHaveBeenCalledTimes(1 + 1);
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    await renderDetail();

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(receipt);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('form:PR-0001')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
