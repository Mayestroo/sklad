import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
// A super-admin with no company selected.
const auth: { token: string; company: { id: string } | null } = { token: 'tok', company: null };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({ useLocale: () => 'uz' }));

import { useApiQuery } from './useApiQuery';

function Probe({ endpoint, platform }: { endpoint: string; platform?: boolean }) {
  const query = useApiQuery<{ value: string }>(endpoint, platform ? { scope: 'platform' } : {});
  return <div>{query.data ? query.data.value : query.fetchStatus}</div>;
}

describe('useApiQuery', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    auth.company = null;
  });

  it('waits for a company before loading tenant data', async () => {
    apiFetch.mockResolvedValue({ value: 'loaded' });
    renderPage(<Probe endpoint="/sales/orders" />);

    expect(await screen.findByText('idle')).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('loads platform data without a company and without a tenant header', async () => {
    apiFetch.mockResolvedValue({ value: 'loaded' });
    renderPage(<Probe endpoint="/super-admin/metrics" platform />);

    expect(await screen.findByText('loaded')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/super-admin/metrics',
      expect.objectContaining({ token: 'tok', tenantId: undefined }),
    );
  });

  it('does not send the selected company with platform data', async () => {
    auth.company = { id: 'tenant-1' };
    apiFetch.mockResolvedValue({ value: 'loaded' });
    renderPage(<Probe endpoint="/super-admin/metrics" platform />);

    expect(await screen.findByText('loaded')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith(
      '/super-admin/metrics',
      expect.objectContaining({ tenantId: undefined }),
    );
  });
});
