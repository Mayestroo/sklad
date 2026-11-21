import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = {
  token: 'tok',
  company: { id: 'tenant-1' },
  user: { id: 'u1', roles: ['company_admin'], permissions: [] as string[] },
  hasPermission: () => true,
};
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => async () => true }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock('next-intl', async () => {
  // Real messages, so the tests read the texts users see (TZ 11.8).
  const actual = await vi.importActual<typeof import('next-intl')>('next-intl');
  const messages = (await import('@/../messages/uz.json')).default;
  return { ...actual, useLocale: () => 'uz', useTranslations: (namespace?: string) => actual.createTranslator({ locale: 'uz', messages, namespace: namespace as never }) };
});

import ProductionPage from './page';

const document = {
  id: 'd1', docNumber: 'PR-0001', docDate: '2026-11-01', status: 'IN_PROGRESS', recipeId: 'r1', plannedQuantity: 5, producedQuantity: null,
  plannedMaterialCost: 0, actualMaterialCost: 0, extraCost: 0, totalCost: 0, unitCost: 0, displayCost: 25000,
  product: { id: 'p1', name: { uz: 'Non' }, type: 'FINISHED_PRODUCT', unitOfMeasure: 'piece' },
  warehouseId: 'w1', warehouse: { id: 'w1', name: { uz: 'Asosiy ombor' } }, responsible: null,
};
const recipe = {
  id: 'r1', productId: 'p1', outputQuantity: 1, isActive: true, isArchived: false, updatedAt: '2026-11-01T00:00:00Z',
  product: { id: 'p1', name: { uz: 'Non' }, type: 'FINISHED_PRODUCT', unitOfMeasure: 'piece', sku: 'FIN-1' },
  items: [{ productId: 'm1', quantity: 500, unit: 'g', lossPercent: 0, product: { id: 'm1', name: { uz: 'Un' }, type: 'RAW_MATERIAL', unitOfMeasure: 'kg' } }],
  estimate: { normTotal: 6000, perUnit: 6000, missingPrice: true, lines: [{ entryUnitCost: 12, total: 6000 }] },
};
const stats = { draft: 0, inProgress: 1, completed: 3, cancelled: 0, completedCost: 168000 };
const DOCS = '/production/documents';
const REFERENCE = ['/production/recipes?status=all', '/production/finished-products', '/production/materials', '/tenants/warehouses', '/users/staff'];

function routes(documentsFail: () => boolean = () => false) {
  apiFetch.mockImplementation((url: string) => {
    if (url.startsWith(DOCS)) {
      return documentsFail() ? Promise.reject(new Error('Server error')) : Promise.resolve({ items: [document], total: 1, page: 1, pageSize: 20, stats });
    }
    if (url === '/production/recipes?status=all') return Promise.resolve([recipe]);
    if (url === '/production/finished-products' || url === '/production/materials') return Promise.resolve([]);
    if (url === '/tenants/warehouses') return Promise.resolve([{ id: 'w1', name: { uz: 'Asosiy ombor' } }]);
    if (url === '/users/staff') return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}
const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;
const docCalls = () => apiFetch.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith(DOCS));

describe('Production page (TZ Ishlab chiqarish 6, 11)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    window.history.replaceState(null, '', '/uz/production');
  });

  it('loads the documents and each reference list once; the cards show the document statistics', async () => {
    routes();
    renderPage(<ProductionPage />);

    expect(await screen.findAllByText('PR-0001')).toBeTruthy();
    await waitFor(() => expect(callsTo('/users/staff')).toBe(1));
    expect(docCalls()).toHaveLength(1);
    for (const url of REFERENCE) expect(callsTo(url)).toBe(1);
    // The flow strip: step 2 (in work) and step 3 (finished) carry the document statistics.
    const steps = screen.getByRole('list', { name: /bosqichlari/ });
    expect(steps.textContent).toMatch(/Jarayonda\s*1/);
    expect(steps.textContent).toMatch(/Yakunlangan\s*3/);
  });

  it('a typed search reloads only the documents, once typing pauses', async () => {
    routes();
    renderPage(<ProductionPage />);
    await screen.findAllByText('PR-0001');
    await waitFor(() => expect(callsTo('/users/staff')).toBe(1));

    const search = screen.getByLabelText('Hujjatlarni qidirish');
    fireEvent.change(search, { target: { value: 'P' } });
    fireEvent.change(search, { target: { value: 'PR' } });

    await waitFor(() => expect(docCalls().some((u) => u.includes('search=PR'))).toBe(true));
    expect(docCalls().some((u) => /search=P(&|$)/.test(u))).toBe(false);
    for (const url of REFERENCE) expect(callsTo(url)).toBe(1);
    // The active filter shows as a chip with a remove button.
    expect(screen.getByRole('button', { name: /Filtrni olib tashlash: «PR»/ })).toBeTruthy();
  });

  it('"show in the list" on the finished step filters by that status', async () => {
    routes();
    renderPage(<ProductionPage />);
    await screen.findAllByText('PR-0001');
    const showButtons = within(screen.getByRole('list', { name: /bosqichlari/ })).getAllByRole('button', { name: /Ro‘yxatda ko‘rsatish/ });
    fireEvent.click(showButtons[showButtons.length - 1]);
    await waitFor(() => expect(docCalls().some((u) => u.includes('status=COMPLETED'))).toBe(true));
  });

  it('the recipes tab has its own cards and button, and remembers itself in the URL', async () => {
    routes();
    renderPage(<ProductionPage />);
    await screen.findAllByText('PR-0001');
    fireEvent.click(screen.getByRole('tab', { name: /Retsepturalar/ }));

    expect(window.location.search).toBe('?tab=recipes');
    expect(screen.getByRole('button', { name: /Jami retseptura\s*1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tannarxi hisoblanmagan\s*1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yangi retseptura/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ishlab chiqarish hujjati/ })).toBeNull();
    // Composition as chips, not one long text.
    expect(screen.getAllByText(/Un · 500/).length).toBeGreaterThan(0);
  });

  it('shows the load error and reloads on retry', async () => {
    let fail = true;
    routes(() => fail);
    renderPage(<ProductionPage />);

    expect((await screen.findAllByRole('alert'))[0].textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findAllByText('PR-0001')).toBeTruthy();
  });
});
