import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const login = vi.fn();
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ login }) }));
vi.mock('next-intl', () => ({
  useLocale: () => 'uz',
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key} ${Object.values(values).join(' ')}` : key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/ui/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

import RegisterPage from './page';

/** D3: sign-up ends with "check your inbox"; nobody is signed in yet. */
describe('Register page', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    apiFetch.mockReset();
    login.mockReset();
  });

  const fill = (placeholder: string, value: string) =>
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

  it('sends the form once and asks the user to confirm by email, without signing in', async () => {
    apiFetch.mockResolvedValue({ status: 'CONFIRMATION_SENT' });
    const { container } = render(<RegisterPage />);

    fill("Navro'z Trade LLC", 'Yangi MChJ');
    fill('ali@navroztrade.uz', 'owner@example.com');
    fill('••••••••', 'secret123');
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('checkInboxTitle');
    expect(status.textContent).toContain('owner@example.com');
    expect(container.querySelector('form')).toBeNull();
    expect(login).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/auth/register', expect.objectContaining({ method: 'POST' }));
  });

  it('keeps the form and what was typed when the request fails', async () => {
    apiFetch.mockRejectedValue(new Error('Too many requests'));
    const { container } = render(<RegisterPage />);

    fill('ali@navroztrade.uz', 'owner@example.com');
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(await screen.findByText('Too many requests')).toBeTruthy();
    expect((screen.getByPlaceholderText('ali@navroztrade.uz') as HTMLInputElement).value).toBe('owner@example.com');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
