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

import JournalPage from './page';

const entries = [
  {
    id: 'je1',
    entryNumber: 'JE-2026-00001',
    createdAt: '2026-10-15T00:00:00.000Z',
    description: 'Kassa kirim',
    lines: [
      {
        amount: 8000,
        debitAccount: { code: '5010', name: { uz: 'Kassa', ru: 'Касса' } },
        creditAccount: { code: '9010', name: { uz: 'Daromad', ru: 'Доход' } },
      },
    ],
  },
];

describe('Journal page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the journal entries once', async () => {
    apiFetch.mockResolvedValue(entries);
    renderPage(<JournalPage />);

    expect(screen.getByText('loading')).toBeTruthy();
    expect(await screen.findByText('JE-2026-00001')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/accounting/journal',
      expect.objectContaining({ token: 'tok', tenantId: 'tenant-1' }),
    );
  });

  it('shows the error and reloads on retry', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Timeout'));
    renderPage(<JournalPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Timeout');

    apiFetch.mockResolvedValueOnce(entries);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('JE-2026-00001')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  it('shows the empty state when there are no entries', async () => {
    apiFetch.mockResolvedValue([]);
    renderPage(<JournalPage />);
    expect(await screen.findByText('Buxgalteriya provodkalari mavjud emas')).toBeTruthy();
  });
});
