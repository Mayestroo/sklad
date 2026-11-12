import { allocateFifoCost, FifoBatchInput } from './fifo-batches';

const batch = (
  id: string,
  remainingQty: number,
  landedCost: number,
  createdAt: string,
  purchasePrice = landedCost,
): FifoBatchInput => ({
  id,
  remainingQty,
  landedCost,
  purchasePrice,
  createdAt: new Date(createdAt),
});

describe('allocateFifoCost', () => {
  it('takes part of the oldest batch when it covers the request', () => {
    const result = allocateFifoCost(3, [
      batch('new', 10, 200, '2026-02-01'),
      batch('old', 5, 100, '2026-01-01'),
    ]);
    expect(result.batches).toEqual([
      { batchId: 'old', quantity: 3, unitCost: 100 },
    ]);
    expect(result.totalCost).toBe(300);
    expect(result.unitCost).toBe(100);
  });

  it('spans several batches oldest first and averages the unit cost', () => {
    const result = allocateFifoCost(7, [
      batch('b2', 10, 200, '2026-02-01'),
      batch('b1', 5, 100, '2026-01-01'),
    ]);
    expect(result.batches).toEqual([
      { batchId: 'b1', quantity: 5, unitCost: 100 },
      { batchId: 'b2', quantity: 2, unitCost: 200 },
    ]);
    expect(result.totalCost).toBe(900);
    expect(result.unitCost).toBe(128.57);
  });

  it('uses the per-unit landed cost, falling back to purchase price only when it is zero', () => {
    const result = allocateFifoCost(2, [
      batch('a', 1, 0, '2026-01-01', 80),
      batch('b', 1, 120, '2026-01-02', 100),
    ]);
    expect(result.batches.map((b) => b.unitCost)).toEqual([80, 120]);
  });

  it('breaks createdAt ties by id so the order is deterministic', () => {
    const result = allocateFifoCost(1, [
      batch('z', 1, 1, '2026-01-01'),
      batch('a', 1, 2, '2026-01-01'),
    ]);
    expect(result.batches[0].batchId).toBe('a');
  });

  it('does not leave floating-point residue across batches', () => {
    const result = allocateFifoCost(0.3, [
      batch('a', 0.1, 10, '2026-01-01'),
      batch('b', 0.2, 10, '2026-01-02'),
    ]);
    expect(result.batches.map((b) => b.quantity)).toEqual([0.1, 0.2]);
  });

  it('refuses when the batches cannot cover the request', () => {
    expect(() =>
      allocateFifoCost(6, [batch('a', 5, 100, '2026-01-01')]),
    ).toThrow('Insufficient batch quantity');
  });

  it('rejects a non-positive request', () => {
    expect(() =>
      allocateFifoCost(0, [batch('a', 5, 100, '2026-01-01')]),
    ).toThrow();
  });
});
