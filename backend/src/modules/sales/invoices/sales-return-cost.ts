import { BadRequestException } from '@nestjs/common';

type NumberLike = number | string | { toString(): string };

export interface SoldLineCost {
  quantity: NumberLike;
  /** Unit COGS the sale posted (UZS), written from the FIFO allocation. */
  unitCogs: NumberLike | null;
  /** The FIFO batches the sale consumed for this line, when recorded. */
  batchConsumptions?: Array<{ quantity: NumberLike; unitCost: NumberLike }>;
}

/**
 * Unit cost (UZS) at which returned goods re-enter stock: the FIFO cost the
 * original sale took out, never the product's catalog cost. A return reverses
 * exactly what the sale expensed to 9110, so a line the sale costed at 0 is
 * returned at 0.
 *
 * Uses the sale's batch consumptions when they were recorded (exact batch
 * costs); otherwise the unit COGS the sale stored on its lines. Lines are
 * weighted by quantity when one product appears on several invoice lines.
 */
export function originalSaleUnitCost(lines: SoldLineCost[]): number {
  if (lines.length === 0) {
    throw new BadRequestException(
      'Mahsulot tanlangan sotuv fakturasida mavjud emas',
    );
  }

  const consumptions = lines.flatMap((line) => line.batchConsumptions ?? []);
  const consumedQty = consumptions.reduce((s, c) => s + Number(c.quantity), 0);
  if (consumedQty > 0) {
    const consumedCost = consumptions.reduce(
      (s, c) => s + Number(c.quantity) * Number(c.unitCost),
      0,
    );
    return assertCost(consumedCost / consumedQty);
  }

  const soldQty = lines.reduce((s, line) => s + Number(line.quantity), 0);
  if (!(soldQty > 0)) {
    throw new BadRequestException(
      "Asl sotuv qatorida miqdor noto'g'ri, tannarxni aniqlab bo'lmaydi",
    );
  }
  const postedCost = lines.reduce(
    (s, line) => s + Number(line.quantity) * Number(line.unitCogs ?? 0),
    0,
  );
  return assertCost(postedCost / soldQty);
}

function assertCost(unitCost: number): number {
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new BadRequestException(
      "Asl sotuv tannarxi noto'g'ri, qaytarishni rasmiylashtirib bo'lmaydi",
    );
  }
  return Math.round(unitCost * 100) / 100;
}
