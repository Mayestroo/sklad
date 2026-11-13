/**
 * Integration test (real Postgres, DATABASE_URL_TEST). Plan Task 1 Step 3:
 * the sale-price currency backfill fills only NULL currencies from a valid
 * company sales default, leaves the rest NULL, and can run twice.
 */
import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { PrismaService } from './prisma.service';

const MIGRATION = join(
  __dirname,
  '../../../prisma/migrations/20261113000300_sales_price_currency_backfill/migration.sql',
);

describe('sale-price currency backfill migration', () => {
  const prisma = new PrismaService();
  const runId = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];

  const company = async (slug: string, settings: object) => {
    const row = await prisma.company.create({
      data: {
        name: { uz: slug, ru: slug },
        slug: `${slug}-${runId}`,
        settings,
      },
    });
    tenantIds.push(row.id);
    return row.id;
  };
  const product = (
    tenantId: string,
    sku: string,
    salePriceCurrency: string | null,
  ) =>
    prisma.product.create({
      data: {
        tenantId,
        name: { uz: sku, ru: sku },
        sku: `${sku}-${runId}`,
        salePrice: 1000,
        salePriceCurrency,
      },
    });
  const runMigration = async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL_TEST,
    });
    await client.connect();
    try {
      await client.query(readFileSync(MIGRATION, 'utf8'));
    } finally {
      await client.end();
    }
  };
  const currencyOf = async (id: string) =>
    (await prisma.product.findFirstOrThrow({ where: { id } }))
      .salePriceCurrency;

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.company.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('fills NULL currencies from a valid sales default only, and re-runs cleanly', async () => {
    const usdTenant = await company('bf-usd', {
      sales: { defaultCurrency: 'USD' },
    });
    const noDefault = await company('bf-none', {
      accounting: { defaultCurrency: 'USD' },
    });
    const badDefault = await company('bf-eur', {
      sales: { defaultCurrency: 'EUR' },
    });

    const legacy = await product(usdTenant, 'legacy', null);
    const explicit = await product(usdTenant, 'explicit', 'UZS');
    const orphan = await product(noDefault, 'orphan', null);
    const unsupported = await product(badDefault, 'eur', null);

    await runMigration();
    await runMigration();

    expect(await currencyOf(legacy.id)).toBe('USD');
    expect(await currencyOf(explicit.id)).toBe('UZS');
    expect(await currencyOf(orphan.id)).toBeNull();
    expect(await currencyOf(unsupported.id)).toBeNull();
  });
});
