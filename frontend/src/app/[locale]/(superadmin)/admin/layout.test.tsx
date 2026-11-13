import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const push = vi.fn();
// Stable like next-intl's memoised router.
const router = { push };
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => router,
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));
vi.mock('@/components/ui/ThemeSwitcher', () => ({ ThemeSwitcher: () => null }));
vi.mock('@/components/ui/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
const auth = {
  user: { firstName: 'Ali', lastName: 'Valiyev', email: 'a@example.com', roles: ['super_admin'] as string[] },
  isAuthenticated: true,
  isLoading: false,
  logout: vi.fn(),
  hasRole: (role: string) => auth.user.roles.includes(role),
};
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

import SuperAdminLayout from './layout';

describe('Super-admin layout guard', () => {
  beforeEach(() => {
    push.mockReset();
    auth.isAuthenticated = true;
    auth.isLoading = false;
    auth.user.roles = ['super_admin'];
  });

  it('shows the page to a super-admin and does not redirect', () => {
    render(<SuperAdminLayout><p>admin content</p></SuperAdminLayout>);
    expect(screen.getByText('admin content')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to the login page once', () => {
    auth.isAuthenticated = false;
    const { rerender } = render(<SuperAdminLayout><p>admin content</p></SuperAdminLayout>);
    rerender(<SuperAdminLayout><p>admin content</p></SuperAdminLayout>);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('admin content')).toBeNull();
  });

  it('sends a company user to the dashboard', () => {
    auth.user.roles = ['company_admin'];
    render(<SuperAdminLayout><p>admin content</p></SuperAdminLayout>);
    expect(push).toHaveBeenCalledWith('/');
    expect(screen.queryByText('admin content')).toBeNull();
  });

  it('waits while the session is restored', () => {
    auth.isLoading = true;
    auth.isAuthenticated = false;
    render(<SuperAdminLayout><p>admin content</p></SuperAdminLayout>);
    expect(push).not.toHaveBeenCalled();
  });
});
