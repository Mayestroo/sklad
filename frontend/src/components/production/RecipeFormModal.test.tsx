import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'tok', company: { id: 'tenant-1' } }) }));
vi.mock('@/context/ConfirmContext', () => ({ useConfirm: () => async () => true }));
vi.mock('next-intl', async () => {
  // Real messages, so the tests read the texts users see (TZ 11.8).
  const actual = await vi.importActual<typeof import('next-intl')>('next-intl');
  const messages = (await import('@/../messages/uz.json')).default;
  return { ...actual, useLocale: () => 'uz', useTranslations: (namespace?: string) => actual.createTranslator({ locale: 'uz', messages, namespace: namespace as never }) };
});

import { RecipeFormModal } from './RecipeFormModal';

const bread = { id: 'p1', name: { uz: 'Non' }, type: 'FINISHED_PRODUCT', unitOfMeasure: 'piece' };
const flour = { id: 'm1', name: { uz: 'Un' }, type: 'RAW_MATERIAL', unitOfMeasure: 'kg', costPrice: 12000, costPriceCurrency: 'UZS', stock_qty: 50 };
const salt = { id: 'm2', name: { uz: 'Tuz' }, type: 'RAW_MATERIAL', unitOfMeasure: 'kg', costPrice: 0, costPriceCurrency: 'UZS', stock_qty: 0 };
const recipe = {
  id: 'r1',
  productId: 'p1',
  outputQuantity: 10,
  note: null,
  isActive: true,
  items: [
    { productId: 'm1', quantity: 500, unit: 'g', lossPercent: 0 },
    { productId: 'm2', quantity: 0.1, unit: null, lossPercent: 0 },
  ],
};

const digits = () => (screen.getByTestId('recipe-cost-summary').textContent ?? '').replace(/\s/g, '');

function renderForm(onSaved = vi.fn()) {
  renderPage(
    <RecipeFormModal
      isOpen
      recipe={recipe}
      products={[bread]}
      materials={[flour, salt]}
      existingRecipes={[{ id: 'r1', productId: 'p1' }]}
      locale="uz"
      onClose={() => {}}
      onSaved={onSaved}
      onProductsChanged={() => {}}
    />,
  );
  return onSaved;
}

describe('RecipeFormModal (TZ Ishlab chiqarish 4)', () => {
  beforeEach(() => apiFetch.mockReset());

  it('A: 500 g of flour at 12 000 UZS/kg: unit, price and sum fill in; the summary is the norm and one unit', () => {
    renderForm();
    // 6 000 for the norm of 10 → 600 per piece.
    expect(digits()).toContain('6000');
    expect(digits()).toContain('600');
    // Salt has no price: 0 and a yellow warning, never a dash.
    expect(screen.getByText(/Bu xomashyo uchun narx yo‘q/)).toBeTruthy();
  });

  it('recalculates instantly when the quantity, loss or norm changes (TZ 4.4)', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Miqdor 1'), { target: { value: '1000' } });
    expect(digits()).toContain('12000');
    fireEvent.change(screen.getByLabelText('Yo‘qotish foizi 1'), { target: { value: '20' } });
    expect(digits()).toContain('15000');
  });

  it('saves with PUT: entry unit, loss and the active flag', async () => {
    apiFetch.mockResolvedValue({ id: 'r1' });
    const onSaved = renderForm();
    fireEvent.change(screen.getByLabelText('Yo‘qotish foizi 1'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('r1', 'Retseptura yangilandi'));
    const [url, options] = apiFetch.mock.calls[0];
    expect(url).toBe('/production/recipes/r1');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({
      productId: 'p1',
      outputQuantity: 10,
      isActive: true,
      materials: [
        { productId: 'm1', quantity: 500, unit: 'g', lossPercent: 5 },
        { productId: 'm2', quantity: 0.1, lossPercent: 0 },
      ],
    });
  });

  it('shows field errors and a summary instead of saving an invalid recipe', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Miqdor 2'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Yo‘qotish foizi 1'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));
    expect((await screen.findAllByRole('alert'))[0].textContent).toMatch(/2 ta xato/);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
