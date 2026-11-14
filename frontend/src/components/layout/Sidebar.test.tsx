import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let pathname = '/inventory';
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => pathname,
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ company: { id: 'tenant-1', name: 'Javox' }, user: { roles: ['company_admin'] }, hasPermission: () => true }),
}));

import { Sidebar } from './Sidebar';

const salesGroupOpen = () => screen.queryByText('salesOrders') !== null;

describe('Sidebar groups', () => {
  beforeEach(() => {
    pathname = '/inventory';
  });

  it('starts with the group of the current route open', () => {
    pathname = '/sales/orders';
    render(<Sidebar />);
    expect(salesGroupOpen()).toBe(true);
  });

  it('opens the sales group when the route enters sales', () => {
    const { rerender } = render(<Sidebar />);
    expect(salesGroupOpen()).toBe(false);

    pathname = '/sales/returns';
    rerender(<Sidebar />);
    expect(salesGroupOpen()).toBe(true);
  });

  it('keeps the group closed when the user closes it and moves within sales', () => {
    pathname = '/sales';
    const { rerender } = render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /^sales$/ }));
    expect(salesGroupOpen()).toBe(false);

    pathname = '/sales/returns';
    rerender(<Sidebar />);
    expect(salesGroupOpen()).toBe(false);
  });
});
