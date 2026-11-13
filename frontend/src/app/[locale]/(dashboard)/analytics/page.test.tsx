import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' } };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useDefaultCurrency', () => ({ useDefaultCurrency: () => 'UZS' }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));

import AnalyticsPage from './page';

function respond(endpoint: string): unknown {
  if (endpoint.startsWith('/analytics/kpi-summary')) {
    return { currency: 'UZS', totalRevenue: 1000, totalProfit: 100, totalOrders: 3, averageOrderValue: 333 };
  }
  if (endpoint.startsWith('/analytics/financial-ratios')) return {};
  return [];
}

const calledEndpoints = () => apiFetch.mock.calls.map((c) => c[0] as string);

describe('Analytics page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads each report once, and only the range reports again when the range changes', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => respond(endpoint));
    renderPage(<AnalyticsPage />);

    expect(await screen.findByText('JAMI SOTUV TUSHUMI')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(6);
    expect(calledEndpoints()).toEqual(
      expect.arrayContaining([
        '/analytics/kpi-summary?range=month',
        '/analytics/sales-trend?range=month',
        '/analytics/category-breakdown?range=month',
        '/analytics/top-products?range=month&limit=10',
        '/analytics/top-clients?range=month&limit=5',
        '/analytics/financial-ratios',
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Yillik' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(11));
    expect(calledEndpoints()).toContain('/analytics/kpi-summary?range=year');
    expect(calledEndpoints().filter((e) => e === '/analytics/financial-ratios')).toHaveLength(1);
  });

  it('keeps the page when only the optional top clients fail', async () => {
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/analytics/top-clients')) throw new Error('nope');
      return respond(endpoint);
    });
    renderPage(<AnalyticsPage />);

    expect(await screen.findByText('JAMI SOTUV TUSHUMI')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the error and reloads the failed report on retry', async () => {
    let failKpi = true;
    apiFetch.mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/analytics/kpi-summary') && failKpi) throw new Error('Server error');
      return respond(endpoint);
    });
    renderPage(<AnalyticsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    failKpi = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('JAMI SOTUV TUSHUMI')).toBeTruthy();
    expect(calledEndpoints().filter((e) => e.startsWith('/analytics/kpi-summary'))).toHaveLength(2);
  });
});
