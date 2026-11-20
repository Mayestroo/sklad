import {
  cardUnitCostUzs,
  checkRecipeGraph,
  computeProductionCost,
  computeRecipeCost,
  deviationPercent,
  grossConsumption,
  plannedMaterialQuantity,
  resolveUnitFactor,
  unitOptionsFor,
} from '../../../../shared/production/costing';

/** TZ "Ishlab chiqarish" 12: the costing scenarios, checked on the shared functions. */
describe('production costing (TZ 8, scenarios A–N)', () => {
  const line = (
    quantity: number,
    unitFactor: number,
    unitCost: number,
    lossPercent = 0,
  ) => ({
    quantity,
    unitFactor,
    lossPercent,
    unitCost,
    hasPrice: unitCost > 0,
  });

  it('A: 500 g of flour at 12 000 UZS/kg costs 6 000 UZS', () => {
    const factor = resolveUnitFactor('kg', 'g')!;
    const result = computeRecipeCost([line(500, factor, 12_000)], 1);
    expect(result.lines[0].total).toBe(6000);
    expect(result.normTotal).toBe(6000);
    expect(result.perUnit).toBe(6000);
  });

  it('D: a material without a price costs 0 and is flagged', () => {
    const result = computeRecipeCost([line(2, 1, 0)], 1);
    expect(result.normTotal).toBe(0);
    expect(result.missingPrice).toBe(true);
    expect(cardUnitCostUzs({ costPrice: 0 })).toEqual({
      unitCost: 0,
      hasPrice: false,
    });
  });

  it('E: sugar 200 g with 5% loss: 0.2105 kg, 2 105.26 UZS', () => {
    expect(grossConsumption(0.2, 5)).toBeCloseTo(0.210526, 6);
    const result = computeRecipeCost([line(200, 0.001, 10_000, 5)], 1);
    expect(result.lines[0].total).toBe(2105.26);
  });

  it('F: 3 pieces of oil sold by 12-piece boxes at 144 000 UZS = 36 000 UZS', () => {
    // Base unit box, the card defines 1 dona = 1/12 box.
    const factor = resolveUnitFactor('box', 'dona', [
      { name: 'dona', factor: 1 / 12 },
    ])!;
    expect(computeRecipeCost([line(3, factor, 144_000)], 1).normTotal).toBe(
      36_000,
    );
    // Same with the factor rounded to the 12 decimals the database keeps.
    const stored = Number((1 / 12).toFixed(12));
    expect(computeRecipeCost([line(3, stored, 144_000)], 1).normTotal).toBe(
      36_000,
    );
  });

  it('G: 120 000 UZS over 40 pieces is 3 000 UZS each', () => {
    expect(computeProductionCost(120_000, [], 40)?.unitCost).toBe(3000);
  });

  it('N: extra costs are added: 100 000 + 50 000 + 20 000 over 10 = 17 000', () => {
    expect(computeProductionCost(100_000, [50_000, 20_000], 10)).toEqual({
      materialCost: 100_000,
      extraCost: 70_000,
      totalCost: 170_000,
      unitCost: 17_000,
    });
  });

  it('a produced quantity of 0 never divides by zero', () => {
    expect(computeProductionCost(100, [], 0)).toBeNull();
  });

  it('the norm divides the per-unit cost and the planned quantity scales usage', () => {
    const result = computeRecipeCost([line(10, 1, 1000)], 4);
    expect(result.perUnit).toBe(2500);
    expect(
      plannedMaterialQuantity(
        { quantity: 200, unitFactor: 0.001, lossPercent: 5 },
        10,
        1,
      ),
    ).toBe(2.105);
  });

  it('kg and g never mix: g is converted to the kg base unit', () => {
    expect(unitOptionsFor('kg').map((u) => u.code)).toEqual(['kg', 'g']);
    expect(resolveUnitFactor('kg', 'qop', [{ name: 'qop', factor: 50 }])).toBe(
      50,
    );
    expect(resolveUnitFactor('kg', 'litr')).toBeNull();
  });

  it('USD card cost uses its rate, never a guessed one', () => {
    expect(
      cardUnitCostUzs({
        costPrice: 2,
        costPriceCurrency: 'USD',
        costPriceExchangeRate: 12_500,
      }),
    ).toEqual({ unitCost: 25_000, hasPrice: true });
    expect(
      cardUnitCostUzs({ costPrice: 2, costPriceCurrency: 'USD' }).hasPrice,
    ).toBe(false);
  });

  it('M: a cycle Xamir → Non → Xamir is rejected', () => {
    const edges = [{ productId: 'non', materialIds: ['xamir', 'tuz'] }];
    expect(
      checkRecipeGraph(edges, {
        productId: 'xamir',
        materialIds: ['un', 'non'],
      }),
    ).toEqual({
      cycle: ['xamir', 'non', 'xamir'],
    });
  });

  it('nesting is allowed up to 3 levels', () => {
    const edges = [
      { productId: 'b', materialIds: ['a'] },
      { productId: 'c', materialIds: ['b'] },
    ];
    expect(
      checkRecipeGraph(edges, { productId: 'a', materialIds: ['raw'] }),
    ).toBeNull();
    expect(
      checkRecipeGraph(edges, { productId: 'a', materialIds: ['x'] }),
    ).toBeNull();
    const deeper = [...edges, { productId: 'x', materialIds: ['raw'] }];
    expect(
      checkRecipeGraph(deeper, { productId: 'a', materialIds: ['x'] }),
    ).toEqual({ depth: 4 });
  });

  it('plan vs actual deviation in percent', () => {
    expect(deviationPercent(10, 11)).toBe(10);
    expect(deviationPercent(0, 1)).toBeNull();
  });
});
