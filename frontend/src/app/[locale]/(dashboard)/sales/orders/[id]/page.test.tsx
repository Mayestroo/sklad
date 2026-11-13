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
vi.mock('@/components/sales/SalesOrderForm', () => ({
  SalesOrderForm: ({ initialData }: { initialData: { docNumber: string } }) => <div>form:{initialData.docNumber}</div>,
}));

import SalesOrderDetailPage from './page';

const doc = { id: 'd1', docNumber: 'SO-0001' };

async function renderDetail() {
  const params = Promise.resolve({ id: 'd1' });
  let result!: ReturnType<typeof renderPage>;
  await act(async () => {
    result = renderPage(
      <Suspense fallback={null}>
        <SalesOrderDetailPage params={params} />
      </Suspense>,
    );
  });
  return result;
}

describe('Sales order detail page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the document once and hands it to the form', async () => {
    apiFetch.mockResolvedValue(doc);
    await renderDetail();

    expect(await screen.findByText('form:SO-0001')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/sales/orders/d1',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('loads the document afresh on every visit (no stale copy for the form)', async () => {
    apiFetch.mockResolvedValue(doc);
    const first = await renderDetail();
    await screen.findByText('form:SO-0001');
    first.unmount();

    await renderDetail();
    await screen.findByText('form:SO-0001');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    await renderDetail();

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(doc);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('form:SO-0001')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
