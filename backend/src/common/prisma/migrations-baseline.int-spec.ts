import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { PrismaService } from './prisma.service';

/**
 * The test database must be built from prisma/migrations (npm run test:db:prepare),
 * not `db push`: the database-level invariants below live only in the migrations,
 * and a schema built without them silently disables currency isolation guards.
 */
describe('database built from migrations', () => {
  const prisma = new PrismaService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has the cash-account and payment guard triggers', async () => {
    const rows = await prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`;
    expect(rows.map((r) => r.tgname)).toEqual(
      expect.arrayContaining([
        'cash_accounts_identity_immutability_guard',
        'finance_transactions_cash_account_currency_guard',
        'payments_cash_account_type_guard',
      ]),
    );
  });

  it('has the currency and amount CHECK constraints', async () => {
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'c' ORDER BY conname`;
    expect(rows.map((r) => r.conname)).toEqual(
      expect.arrayContaining([
        'batch_consumptions_single_source_check',
        'cash_accounts_type_currency_check',
        'counterparty_settlement_entries_amount_check',
        'counterparty_settlement_entries_currency_check',
        'finance_transactions_exchange_rate_check',
        'products_cost_price_currency_check',
        'products_cost_price_exchange_rate_check',
        'products_sale_price_currency_check',
        'settlement_allocations_amount_check',
        'settlement_allocations_currency_check',
      ]),
    );
  });
});
