import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderPage } from '@/test/render-page';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'tok', company: { id: 'tenant-1' } }) }));
vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));

import { RecipeFormModal } from './RecipeFormModal';

const bread = { id: 'p1', name: { uz: 'Non' }, type: 'PRODUCT', unitOfMeasure: 'piece' };
const flour = { id: 'm1', name: { uz: 'Un' }, type: 'RAW_MATERIAL', unitOfMeasure: 'kg', costPrice: 8000, costPriceCurrency: 'UZS', totalStock: 50 };
const salt = { id: 'm2', name: { uz: 'Tuz' }, type: 'RAW_MATERIAL', unitOfMeasure: 'kg', costPrice: 0, costPriceCurrency: 'UZS', totalStock: 5 };
const recipe = {
  id: 'r1',
  productId: 'p1',
  outputQuantity: 10,
  note: null,
  items: [
    { productId: 'm1', quantity: 5 },
    { productId: 'm2', quantity: 0.1 },
  ],
};

function renderForm(onSaved = vi.fn()) {
  renderPage(
    <RecipeFormModal
      isOpen
      recipe={recipe}
      products={[bread]}
      rawMaterials={[flour, salt]}
      existingRecipes={[{ id: 'r1', productId: 'p1' }]}
      locale="uz"
      onClose={() => {}}
      onSaved={onSaved}
      onProductsChanged={() => {}}
    />,
  );
  return onSaved;
}

describe('RecipeFormModal', () => {
  beforeEach(() => apiFetch.mockReset());

  it('shows the material cost of the norm and of one finished unit, and flags a material without a cost', () => {
    renderForm();
    const summary = screen.getByTestId('recipe-cost-summary');
    const digits = (summary.textContent ?? '').replace(/\s/g, '');
    // 5 kg × 8,000 = 40,000 for 10 pieces → 4,000 per piece; salt has no cost.
    expect(digits).toContain('40000');
    expect(digits).toContain('4000');
    expect(summary.textContent).toContain('Tuz');
  });

  it('saves an edited recipe with PUT, quantities in the card unit', async () => {
    apiFetch.mockResolvedValue({ id: 'r2' });
    const onSaved = renderForm();

    fireEvent.change(screen.getByLabelText('Miqdor 1, kg'), { target: { value: '6' } });
    expect((screen.getByTestId('recipe-cost-summary').textContent ?? '').replace(/\s/g, '')).toContain('48000');
    fireEvent.click(screen.getByRole('button', { name: /Retsepturani saqlash/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, options] = apiFetch.mock.calls[0];
    expect(url).toBe('/production/recipes/r1');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({
      productId: 'p1',
      outputQuantity: 10,
      materials: [
        { productId: 'm1', quantity: 6 },
        { productId: 'm2', quantity: 0.1 },
      ],
    });
  });

  it('refuses a quantity finer than the 3 decimals a recipe keeps', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Miqdor 2, kg'), { target: { value: '0.0004' } });
    fireEvent.click(screen.getByRole('button', { name: /Retsepturani saqlash/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('2');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
