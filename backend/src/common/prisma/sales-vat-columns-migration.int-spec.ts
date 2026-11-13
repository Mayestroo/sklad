/**
 * Integration test (real Postgres, DATABASE_URL_TEST). Plan Task 3 Step 2:
 * the sales VAT / return-discount columns exist, the return-line discount is
 * bounded to 0-100, and the migration can run twice.
 */
import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { PrismaService } from './prisma.service';

const MIGRATION = join(
  __dirname,
  '../../../prisma/migrations/20261113000400_sales_vat_and_return_discount/migration.sql',
);

describe('sales VAT and return-discount columns migration', () => {
  const prisma = new PrismaService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has every VAT/discount column the sales documents need', async () => {
    const rows = await prisma.$queryRaw<
      { table_name: string; column_name: string; column_default: string }[]
    >`
      SELECT table_name, column_name, column_default
      FROM information_schema.columns
      WHERE (table_name, column_name) IN (
        ('sales_orders', 'vat_amount'),
        ('sales_order_items', 'vat_rate'),
        ('sales_order_items', 'vat_amount'),
        ('sales_return_items', 'discount'),
        ('sales_return_items', 'vat_rate'),
        ('sales_return_items', 'vat_amount')
      )`;
    expect(rows.map((r) => `${r.table_name}.${r.column_name}`).sort()).toEqual([
      'sales_order_items.vat_amount',
      'sales_order_items.vat_rate',
      'sales_orders.vat_amount',
      'sales_return_items.discount',
      'sales_return_items.vat_amount',
      'sales_return_items.vat_rate',
    ]);
    expect(rows.find((r) => r.column_name === 'discount')?.column_default).toBe(
      '0',
    );
  });

  it('bounds the return-line discount to 0-100', async () => {
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conname = 'sales_return_items_discount_check'`;
    expect(rows).toHaveLength(1);
  });

  it('re-runs cleanly', async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL_TEST,
    });
    await client.connect();
    try {
      const sql = readFileSync(MIGRATION, 'utf8');
      await client.query(sql);
      await client.query(sql);
    } finally {
      await client.end();
    }
  });
});
