import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));

import { SupplierProfileDrawer } from './SupplierProfileDrawer';

const profile = {
  supplier: { id: 's1', name: 'Javox-BRO LLC', inn: '301234567', phone: '+998901234567' },
  metrics: { totalPurchased: 0, totalPaid: 0, balancesByCurrency: [] },
  receipts: [], payments: [], returns: [],
};
const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;

describe('SupplierProfileDrawer', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the profile once', async () => {
    apiFetch.mockResolvedValue(profile);
    renderPage(<SupplierProfileDrawer isOpen supplierId="s1" onClose={() => {}} />);

    expect(await screen.findByText('301234567')).toBeTruthy();
    expect(callsTo('/purchases/suppliers/s1')).toBe(1);
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<SupplierProfileDrawer isOpen supplierId="s1" onClose={() => {}} />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(profile);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('301234567')).toBeTruthy();
    expect(callsTo('/purchases/suppliers/s1')).toBe(2);
  });
});
