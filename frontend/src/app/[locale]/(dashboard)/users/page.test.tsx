import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = { token: 'tok', company: { id: 'tenant-1' }, hasPermission: () => true };
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/context/ToastContext', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import UsersPage from './page';

const staff = [
  {
    id: 'u1',
    email: 'kassir@example.com',
    firstName: 'Ali',
    lastName: 'Valiyev',
    preferredLanguage: 'uz',
    isActive: true,
    lastLoginAt: null,
    createdAt: '2026-11-01',
    roles: ['salesperson'],
  },
];

describe('Users page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the staff once', async () => {
    apiFetch.mockResolvedValue(staff);
    renderPage(<UsersPage />);

    expect(await screen.findByText('kassir@example.com')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/users/staff',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderPage(<UsersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    apiFetch.mockResolvedValueOnce(staff);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('kassir@example.com')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
