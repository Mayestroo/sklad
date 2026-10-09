import {
  allocateFifoCost,
  scaleRecipeMaterials,
} from './production-calculations';

describe('production calculations', () => {
  it('scales recipe quantities when planning a larger output batch', () => {
    const materials = scaleRecipeMaterials(100, 1, [
      { productId: 'rice', quantity: 1 },
      { productId: 'meat', quantity: 0.5 },
      { productId: 'oil', quantity: 0.1 },
      { productId: 'carrot', quantity: 0.3 },
      { productId: 'onion', quantity: 0.1 },
    ]);

    expect(materials).toEqual([
      { productId: 'rice', plannedQuantity: 100 },
      { productId: 'meat', plannedQuantity: 50 },
      { productId: 'oil', plannedQuantity: 10 },
      { productId: 'carrot', plannedQuantity: 30 },
      { productId: 'onion', plannedQuantity: 10 },
    ]);
  });

  it('calculates actual material cost from FIFO batch costs', () => {
    const allocation = allocateFifoCost(3, [
      {
        id: 'old',
        remainingQty: 2,
        landedCost: 5000,
        purchasePrice: 4900,
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'new',
        remainingQty: 5,
        landedCost: 6000,
        purchasePrice: 5800,
        createdAt: new Date('2026-02-01'),
      },
    ]);

    expect(allocation).toEqual({
      unitCost: 5333.33,
      totalCost: 16000,
      batches: [
        { batchId: 'old', quantity: 2, unitCost: 5000 },
        { batchId: 'new', quantity: 1, unitCost: 6000 },
      ],
    });
  });

  it('rejects a planned consumption when FIFO batches cannot cover it', () => {
    expect(() =>
      allocateFifoCost(4, [
        {
          id: 'only-batch',
          remainingQty: 3,
          landedCost: 5000,
          purchasePrice: 5000,
          createdAt: new Date('2026-01-01'),
        },
      ]),
    ).toThrow('Insufficient batch quantity');
  });
});
