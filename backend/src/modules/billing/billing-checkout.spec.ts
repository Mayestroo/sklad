import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';

jest.mock('../../common/sequences/document-sequence');

describe('BillingService.createCheckout provider configuration', () => {
  const ENV_KEYS = [
    'CLICK_MERCHANT_ID',
    'CLICK_SERVICE_ID',
    'PAYME_MERCHANT_ID',
  ];
  const saved: Record<string, string | undefined> = {};
  let prisma: any;
  let service: BillingService;

  beforeEach(() => {
    ENV_KEYS.forEach((k) => {
      saved[k] = process.env[k];
      delete process.env[k];
    });
    prisma = {
      subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
      subscriptionPayment: {
        create: jest.fn().mockResolvedValue({ id: 'pay-1' }),
      },
    };
    service = new BillingService(prisma);
  });

  afterEach(() =>
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }),
  );

  it.each(['CLICK', 'PAYME'] as const)(
    'refuses a %s checkout when the merchant is not configured, before writing anything',
    async (method) => {
      await expect(
        service.createCheckout('tenant-1', 'STARTER', method),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    },
  );

  it('builds the Click URL from the configured ids', async () => {
    process.env.CLICK_MERCHANT_ID = 'm-1';
    process.env.CLICK_SERVICE_ID = 's-1';
    const res = await service.createCheckout('tenant-1', 'STARTER', 'CLICK');
    expect(res.checkoutUrl).toContain('service_id=s-1&merchant_id=m-1');
    expect(res.checkoutUrl).toContain('transaction_param=pay-1');
  });
});
