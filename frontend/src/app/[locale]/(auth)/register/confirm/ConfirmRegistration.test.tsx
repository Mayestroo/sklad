import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const login = vi.fn();
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ login }) }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { ConfirmRegistration } from './ConfirmRegistration';

/**
 * D3: the emailed link opens this page. The token is sent only when the
 * user presses the button (mail scanners that open links do not use it up),
 * then the new admin is signed in.
 */
describe('Confirm registration', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    apiFetch.mockReset();
    login.mockReset();
  });

  it('sends nothing until the button is pressed, then confirms once and signs in', async () => {
    const auth = { user: { id: 'u1', roles: ['company_admin'] }, company: { id: 't1' }, tokens: {} };
    apiFetch.mockResolvedValue(auth);
    render(<ConfirmRegistration token="tok-123" />);

    expect(apiFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'confirmButton' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith(auth));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/auth/register/confirm',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'tok-123' }) }),
    );
  });

  it('shows the server message when the link is invalid or expired', async () => {
    apiFetch.mockRejectedValue(new Error('Havola muddati o‘tgan'));
    render(<ConfirmRegistration token="old" />);

    fireEvent.click(screen.getByRole('button', { name: 'confirmButton' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Havola muddati o‘tgan');
    expect(login).not.toHaveBeenCalled();
  });

  it('says the link is incomplete when there is no token', () => {
    render(<ConfirmRegistration token={null} />);
    expect(screen.getByRole('alert').textContent).toContain('confirmMissingToken');
    expect(screen.queryByRole('button', { name: 'confirmButton' })).toBeNull();
  });
});
