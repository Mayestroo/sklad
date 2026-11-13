import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePurchaseExpenseDto } from './create-purchase-expense.dto';

/**
 * F8 / ADR 0022: a purchase expense without a currency used to be stored in
 * the column default (UZS) silently. The currency is now required.
 */
describe('CreatePurchaseExpenseDto currency (F8)', () => {
  const base = {
    receiptId: 'receipt-1',
    expenseType: 'TRANSPORT',
    amount: 100,
  };

  async function currencyErrors(body: Record<string, unknown>) {
    const errors = await validate(
      plainToInstance(CreatePurchaseExpenseDto, body),
    );
    return errors.filter((error) => error.property === 'currency');
  }

  it('refuses an expense without a currency', async () => {
    expect(await currencyErrors(base)).toHaveLength(1);
    expect(await currencyErrors({ ...base, currency: '' })).toHaveLength(1);
  });

  it('refuses an unsupported currency', async () => {
    expect(await currencyErrors({ ...base, currency: 'EUR' })).toHaveLength(1);
  });

  it('accepts an explicit supported currency', async () => {
    expect(await currencyErrors({ ...base, currency: 'UZS' })).toHaveLength(0);
    expect(await currencyErrors({ ...base, currency: 'USD' })).toHaveLength(0);
  });
});
