import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const auth = {
  token: 'tok',
  company: { id: 'tenant-1' },
  user: { roles: ['company_admin'], permissions: [] as string[] },
  hasPermission: () => true,
};
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));

import ProductionPage from './page';

const document = {
  id: 'd1', docNumber: 'PR-0001', docDate: '2026-11-01', status: 'IN_PROGRESS', plannedQuantity: 5, producedQuantity: null,
  plannedMaterialCost: 0, actualMaterialCost: 0, unitCost: 0, product: { id: 'p1', name: { uz: 'Non' }, unitOfMeasure: 'piece' },
  warehouse: { id: 'w1', name: { uz: 'Asosiy ombor' } }, responsible: null, materials: [],
};
const recipe = {
  id: 'r1', productId: 'p1', outputQuantity: 1, product: { id: 'p1', name: { uz: 'Non' }, unitOfMeasure: 'piece' }, items: [],
};
const DOCS = '/production/documents';
const REFERENCE = ['/production/recipes', '/inventory/products?type=PRODUCT', '/inventory/products?type=RAW_MATERIAL', '/tenants/warehouses', '/users/staff'];

function routes(documentsFail: () => boolean = () => false) {
  apiFetch.mockImplementation((url: string) => {
    if (url.startsWith(DOCS)) {
      return documentsFail() ? Promise.reject(new Error('Server error')) : Promise.resolve([document]);
    }
    if (url === '/production/recipes') return Promise.resolve([recipe]);
    if (url.startsWith('/inventory/products')) return Promise.resolve([]);
    if (url === '/tenants/warehouses') return Promise.resolve([{ id: 'w1', name: { uz: 'Asosiy ombor' } }]);
    if (url === '/users/staff') return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}
const callsTo = (url: string) => apiFetch.mock.calls.filter(([u]) => u === url).length;
const callsStarting = (prefix: string) => apiFetch.mock.calls.filter(([u]) => String(u).startsWith(prefix)).length;

describe('Production page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('loads the documents and each reference list once', async () => {
    routes();
    renderPage(<ProductionPage />);

    expect(await screen.findByText('PR-0001')).toBeTruthy();
    await waitFor(() => expect(callsTo('/users/staff')).toBe(1));
    expect(callsStarting(DOCS)).toBe(1);
    for (const url of REFERENCE) expect(callsTo(url)).toBe(1);
  });

  it('a typed search reloads only the documents, once typing pauses', async () => {
    routes();
    renderPage(<ProductionPage />);
    await screen.findByText('PR-0001');
    await waitFor(() => expect(callsTo('/users/staff')).toBe(1));

    const search = screen.getByLabelText('Hujjatlarni qidirish');
    fireEvent.change(search, { target: { value: 'P' } });
    fireEvent.change(search, { target: { value: 'PR' } });

    await waitFor(() => expect(callsTo(`${DOCS}?search=PR`)).toBe(1));
    expect(callsTo(`${DOCS}?search=P`)).toBe(0);
    for (const url of REFERENCE) expect(callsTo(url)).toBe(1);
  });

  it('shows the load error and reloads on retry', async () => {
    let fail = true;
    routes(() => fail);
    renderPage(<ProductionPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Server error');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));

    expect(await screen.findByText('PR-0001')).toBeTruthy();
  });
});
