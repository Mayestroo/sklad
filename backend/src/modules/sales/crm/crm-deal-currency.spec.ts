import { BadRequestException } from '@nestjs/common';
import { CrmService } from './crm.service';

jest.mock('../../../common/prisma/assert-tenant-owned', () => ({
  assertTenantOwned: jest.fn().mockResolvedValue(undefined),
}));

/** ADR 0022: a deal amount carries its currency; it is never guessed. */
describe('CrmService deal currency', () => {
  const prisma: any = {
    deal: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      findFirst: jest.fn(),
    },
  };
  const service = new CrmService(prisma);

  it('refuses a nonzero amount without a currency', async () => {
    await expect(
      service.createDeal('t-1', {
        counterpartyId: 'c',
        title: 'D',
        amount: 100,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('saves the currency with the amount; a deal without amount needs none', async () => {
    await expect(
      service.createDeal('t-1', {
        counterpartyId: 'c',
        title: 'D',
        amount: 100,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({ amount: 100, currency: 'USD' });
    await expect(
      service.createDeal('t-1', { counterpartyId: 'c', title: 'D' }),
    ).resolves.toMatchObject({ amount: 0, currency: null });
  });

  it('a legacy deal (no currency) must get one when its amount changes', async () => {
    prisma.deal.findFirst.mockResolvedValue({
      id: 'd',
      amount: 0,
      currency: null,
    });
    await expect(
      service.updateDeal('t-1', 'd', { amount: 50 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateDeal('t-1', 'd', { amount: 50, currency: 'UZS' }),
    ).resolves.toMatchObject({ amount: 50, currency: 'UZS' });
  });
});
