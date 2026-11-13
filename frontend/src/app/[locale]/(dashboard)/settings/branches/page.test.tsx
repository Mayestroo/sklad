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
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import BranchesPage from './page';

const branches = [
  {
    id: 'b1',
    name: { uz: 'Asosiy filial', ru: 'Главный филиал' },
    address: null,
    isMain: true,
    warehouses: [{ id: 'w1', branchId: 'b1', name: { uz: 'Asosiy ombor', ru: 'Главный склад' } }],
  },
];

describe('Branches settings page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the branches with their warehouses once', async () => {
    apiFetch.mockResolvedValue(branches);
    renderPage(<BranchesPage />);

    expect(await screen.findByText('Asosiy filial')).toBeTruthy();
    expect(screen.getByText('Asosiy ombor')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/tenants/branches',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<BranchesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(branches);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Asosiy filial')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
