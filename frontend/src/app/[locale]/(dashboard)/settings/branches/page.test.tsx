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
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }));
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

const unassigned = [{ id: 'w2', branchId: null, name: { uz: 'Chilonzor do‘koni', ru: 'Магазин Чиланзар' } }];

/** Answers each endpoint; `fail` makes /tenants/branches reject once. */
function serve(opts: { fail?: boolean; warehouses?: unknown[] } = {}) {
  let failed = false;
  apiFetch.mockImplementation(async (path: string) => {
    if (path === '/tenants/branches') {
      if (opts.fail && !failed) {
        failed = true;
        throw new Error('Server error');
      }
      return branches;
    }
    if (path === '/tenants/warehouses') return opts.warehouses ?? branches[0].warehouses;
    throw new Error('unexpected ' + path);
  });
}

describe('Branches settings page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the branches with their warehouses once', async () => {
    serve();
    renderPage(<BranchesPage />);

    expect(await screen.findByText('Asosiy filial')).toBeTruthy();
    expect(screen.getByText('Asosiy ombor')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch).toHaveBeenCalledWith('/tenants/branches', expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }));
  });

  it('lists warehouses that belong to no branch, so they can be edited', async () => {
    serve({ warehouses: [...branches[0].warehouses, ...unassigned] });
    renderPage(<BranchesPage />);

    expect(await screen.findByText('Chilonzor do‘koni')).toBeTruthy();
    expect(screen.getByRole('button', { name: '«Chilonzor do‘koni» omborini tahrirlash' })).toBeTruthy();
  });

  it('shows the error and reloads on retry', async () => {
    serve({ fail: true });
    renderPage(<BranchesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('Asosiy filial')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(4));
  });
});
