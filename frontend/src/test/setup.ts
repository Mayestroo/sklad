import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only auto-cleans when the runner exposes a global
// afterEach; Vitest runs without globals here, so unmount after each test.
afterEach(() => {
  cleanup();
});

// Default for components that use the locale-aware navigation (PageHeader
// breadcrumbs, links). A test that needs other behaviour mocks it itself.
vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ children, href, ...rest }: { children?: React.ReactNode; href: string } & Record<string, unknown>) =>
      React.createElement('a', { href, ...rest }, children),
    usePathname: () => '/',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
    redirect: vi.fn(),
    getPathname: ({ href }: { href: string }) => href,
  };
});
