import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
// Loading the Prisma module is what an API process does; it defines how Decimals serialize.
import '../../common/prisma';
import { UpdateOpeningBalanceLinesDto } from './dto/update-opening-balance.dto';

/** A line exactly as GET /api/opening-balances/:id returns it from Prisma. */
const persistedLine = {
  id: 'line-1',
  documentId: 'doc-1',
  category: 'INVENTORY',
  accountId: null,
  productId: 'prod-1',
  warehouseId: 'wh-1',
  counterpartyId: null,
  fixedAssetId: null,
  quantity: new Prisma.Decimal('10.000'),
  unitCost: new Prisma.Decimal('15000.00'),
  amount: new Prisma.Decimal('150000.00'),
  accumulatedDepreciation: new Prisma.Decimal('0.00'),
  netAmount: new Prisma.Decimal('150000.00'),
  currency: 'UZS',
  exchangeRate: new Prisma.Decimal('1.0000'),
  batchNumber: null,
  contractNumber: null,
  notes: null,
};

describe('opening balance document round trip', () => {
  it('serializes money and quantities as JSON numbers', () => {
    const json = JSON.parse(JSON.stringify(persistedLine)) as Record<
      string,
      unknown
    >;
    expect(json.amount).toBe(150000);
    expect(json.quantity).toBe(10);
  });

  it('accepts lines saved back unchanged after loading the document', async () => {
    const body = JSON.parse(
      JSON.stringify({ lines: [persistedLine] }),
    ) as object;
    const dto = plainToInstance(UpdateOpeningBalanceLinesDto, body);
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toEqual([]);
  });

  it('accepts a fixed-asset line saved back after loading (muammolar B3)', async () => {
    // A FIXED_ASSET line as Prisma returns it: Decimal amounts. When they
    // reached the client as strings, saving the document back failed with
    // "lines.0.amount must be a number conforming to the specified constraints".
    const fixedAssetLine = {
      ...persistedLine,
      category: 'FIXED_ASSET',
      productId: null,
      warehouseId: null,
      quantity: null,
      unitCost: null,
      amount: new Prisma.Decimal('1000000.00'),
      accumulatedDepreciation: new Prisma.Decimal('0.00'),
      netAmount: new Prisma.Decimal('1000000.00'),
      contractNumber: '121',
      notes: 'laserli kesadigan stanok',
    };
    const body = JSON.parse(JSON.stringify({ lines: [fixedAssetLine] })) as {
      lines: Array<Record<string, unknown>>;
    };
    expect(typeof body.lines[0].amount).toBe('number');

    const dto = plainToInstance(UpdateOpeningBalanceLinesDto, body);
    expect(await validate(dto, { whitelist: true })).toEqual([]);
  });
});
