import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ClickWebhookService } from './click-webhook.service';
import { PaymeWebhookService } from './payme-webhook.service';

/**
 * In-memory stand-in for the subscription tables, so replay and idempotency
 * are checked against real state transitions rather than mock call counts.
 */
function fakePrisma(payments: Record<string, any>[]) {
  const matches = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, cond]) => {
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        const v = row[key] as Date | null;
        if (!v) return false;
        if (cond.gte && v < cond.gte) return false;
        if (cond.lte && v > cond.lte) return false;
        return true;
      }
      return row[key] === cond;
    });
  const prisma: any = {
    subscriptionPayment: {
      findFirst: jest.fn(
        async ({ where }) => payments.find((p) => matches(p, where)) ?? null,
      ),
      findMany: jest.fn(async ({ where }) =>
        payments.filter((p) => matches(p, where)),
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const hit = payments.filter((p) => matches(p, where));
        hit.forEach((p) => Object.assign(p, data));
        return { count: hit.length };
      }),
    },
    subscription: { update: jest.fn(async () => ({})) },
    company: { update: jest.fn(async () => ({})) },
  };
  prisma.$transaction = jest.fn(async (cb: (tx: any) => unknown) => cb(prisma));
  return prisma;
}

function draftPayment(overrides: Record<string, any> = {}) {
  return {
    id: 'pay-1',
    tenantId: 'tenant-1',
    subscriptionId: 'sub-1',
    method: 'CLICK',
    amount: 490000,
    status: 'DRAFT',
    transactionId: null,
    providerState: null,
    providerCreatedAt: null,
    providerPerformedAt: null,
    providerCancelledAt: null,
    providerCancelReason: null,
    ...overrides,
  };
}

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('Click webhook', () => {
  const SECRET = 'click-secret';
  const SERVICE_ID = '777';
  const md5 = (s: string) => createHash('md5').update(s).digest('hex');

  function prepareBody(overrides: Record<string, string> = {}) {
    const body: Record<string, string> = {
      click_trans_id: '9001',
      service_id: SERVICE_ID,
      click_paydoc_id: '5001',
      merchant_trans_id: 'pay-1',
      amount: '490000.00',
      action: '0',
      error: '0',
      error_note: 'Success',
      sign_time: '2026-11-12 10:00:00',
      ...overrides,
    };
    body.sign_string ??= md5(
      body.click_trans_id +
        body.service_id +
        SECRET +
        body.merchant_trans_id +
        body.amount +
        body.action +
        body.sign_time,
    );
    return body;
  }

  function completeBody(
    prepareId: string,
    overrides: Record<string, string> = {},
  ) {
    const body: Record<string, string> = {
      ...prepareBody({ action: '1', sign_string: 'x' }),
      merchant_prepare_id: prepareId,
      ...overrides,
    };
    body.sign_string =
      overrides.sign_string ??
      md5(
        body.click_trans_id +
          body.service_id +
          SECRET +
          body.merchant_trans_id +
          body.merchant_prepare_id +
          body.amount +
          body.action +
          body.sign_time,
      );
    return body;
  }

  let payments: Record<string, any>[];
  let prisma: any;
  let service: ClickWebhookService;

  beforeEach(() => {
    payments = [draftPayment()];
    prisma = fakePrisma(payments);
    service = new ClickWebhookService(
      prisma,
      config({ CLICK_SECRET_KEY: SECRET, CLICK_SERVICE_ID: SERVICE_ID }),
    );
  });

  it('accepts a correctly signed prepare + complete and activates the company', async () => {
    const prepared = await service.handle(prepareBody());
    expect(prepared.error).toBe(0);

    const completed = await service.handle(
      completeBody(String(prepared.merchant_prepare_id)),
    );
    expect(completed.error).toBe(0);
    expect(payments[0].status).toBe('PAID');
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { status: 'ACTIVE' },
    });
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'ACTIVE' },
    });
  });

  it.each([
    ['missing', { sign_string: '' }],
    ['wrong', { sign_string: md5('forged') }],
  ])('rejects a %s signature without touching any row', async (_label, o) => {
    const res = await service.handle(prepareBody(o));
    expect(res.error).toBe(-1);
    expect(prisma.subscriptionPayment.findFirst).not.toHaveBeenCalled();
    expect(prisma.subscriptionPayment.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a body signed with a different secret', async () => {
    const forged = prepareBody({ sign_string: 'x' });
    forged.sign_string = md5(
      forged.click_trans_id +
        forged.service_id +
        'guessed-secret' +
        forged.merchant_trans_id +
        forged.amount +
        forged.action +
        forged.sign_time,
    );
    expect((await service.handle(forged)).error).toBe(-1);
  });

  it('a forged complete cannot activate the company', async () => {
    const prepared = await service.handle(prepareBody());
    const forged = completeBody(String(prepared.merchant_prepare_id), {
      sign_string: md5('forged'),
    });
    expect((await service.handle(forged)).error).toBe(-1);
    expect(payments[0].status).toBe('DRAFT');
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('rejects every call when the secret is not configured', async () => {
    service = new ClickWebhookService(prisma, config({}));
    expect((await service.handle(prepareBody())).error).toBe(-1);
    expect(prisma.subscriptionPayment.findFirst).not.toHaveBeenCalled();
  });

  it('a signed call with the wrong amount cannot activate the company', async () => {
    const res = await service.handle(prepareBody({ amount: '1.00' }));
    expect(res.error).toBe(-2);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('a Click call cannot pay a payment created for Payme', async () => {
    payments[0].method = 'PAYME';
    expect((await service.handle(prepareBody())).error).toBe(-5);
  });

  it('a replayed complete is idempotent: same answer, activated once', async () => {
    const prepared = await service.handle(prepareBody());
    const body = completeBody(String(prepared.merchant_prepare_id));
    const first = await service.handle(body);
    const replay = await service.handle(body);

    expect(replay).toEqual(first);
    expect(prisma.company.update).toHaveBeenCalledTimes(1);
  });

  it('a second Click transaction for an already paid payment is refused', async () => {
    const prepared = await service.handle(prepareBody());
    await service.handle(completeBody(String(prepared.merchant_prepare_id)));

    const again = await service.handle(prepareBody({ click_trans_id: '9002' }));
    expect(again.error).toBe(-4);
    expect(prisma.company.update).toHaveBeenCalledTimes(1);
  });

  it('a complete reporting a Click-side failure cancels instead of activating', async () => {
    const prepared = await service.handle(prepareBody());
    const res = await service.handle(
      completeBody(String(prepared.merchant_prepare_id), { error: '-5017' }),
    );
    expect(res.error).toBe(-9);
    expect(payments[0].status).toBe('CANCELLED');
    expect(prisma.company.update).not.toHaveBeenCalled();
  });
});

describe('Payme webhook', () => {
  const KEY = 'payme-key';
  const auth = (key: string) =>
    'Basic ' + Buffer.from(`Paycom:${key}`).toString('base64');

  let payments: Record<string, any>[];
  let prisma: any;
  let service: PaymeWebhookService;

  const rpc = (method: string, params: Record<string, unknown>, id = 1) => ({
    jsonrpc: '2.0',
    id,
    method,
    params,
  });
  const create = (id = 'pm-1', amount = 49000000) =>
    rpc('CreateTransaction', {
      id,
      time: 1_700_000_000_000,
      amount,
      account: { payment_id: 'pay-1' },
    });

  beforeEach(() => {
    payments = [draftPayment({ method: 'PAYME' })];
    prisma = fakePrisma(payments);
    service = new PaymeWebhookService(
      prisma,
      config({ PAYME_SECRET_KEY: KEY }),
    );
  });

  it('accepts valid auth: create + perform activates the company', async () => {
    const created = await service.handle(auth(KEY), create());
    expect(created.result).toMatchObject({ transaction: 'pay-1', state: 1 });

    const performed = await service.handle(
      auth(KEY),
      rpc('PerformTransaction', { id: 'pm-1' }),
    );
    expect(performed.result).toMatchObject({ transaction: 'pay-1', state: 2 });
    expect(payments[0].status).toBe('PAID');
    expect(prisma.company.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing', undefined],
    ['wrong', auth('guessed')],
    ['malformed', 'Bearer something'],
  ])(
    'rejects %s auth with -32504 before reading anything',
    async (_l, header) => {
      const res = await service.handle(header, create());
      expect(res.error?.code).toBe(-32504);
      expect(prisma.subscriptionPayment.findFirst).not.toHaveBeenCalled();
    },
  );

  it('a forged PerformTransaction cannot activate the company', async () => {
    await service.handle(auth(KEY), create());
    const res = await service.handle(
      auth('guessed'),
      rpc('PerformTransaction', { id: 'pm-1' }),
    );
    expect(res.error?.code).toBe(-32504);
    expect(payments[0].status).toBe('DRAFT');
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('rejects every call when the key is not configured', async () => {
    service = new PaymeWebhookService(prisma, config({}));
    expect((await service.handle(auth(''), create())).error?.code).toBe(-32504);
  });

  it('rejects a wrong amount (tiyin) with -31001', async () => {
    const res = await service.handle(auth(KEY), create('pm-1', 100));
    expect(res.error?.code).toBe(-31001);
  });

  it('replayed Create and Perform are idempotent: activated once', async () => {
    const c1 = await service.handle(auth(KEY), create());
    const c2 = await service.handle(auth(KEY), create());
    expect(c2.result).toEqual(c1.result);

    const perform = rpc('PerformTransaction', { id: 'pm-1' });
    const p1 = await service.handle(auth(KEY), perform);
    const p2 = await service.handle(auth(KEY), perform);
    expect(p2.result).toEqual(p1.result);
    expect(prisma.company.update).toHaveBeenCalledTimes(1);
  });

  it('a second Payme transaction for the same payment is refused', async () => {
    await service.handle(auth(KEY), create('pm-1'));
    const res = await service.handle(auth(KEY), create('pm-2'));
    expect(res.error?.code).toBeLessThanOrEqual(-31050);
    expect(res.error?.code).toBeGreaterThanOrEqual(-31099);
  });

  it('CheckTransaction reports the stored state; unknown ids are -31003', async () => {
    await service.handle(auth(KEY), create());
    const res = await service.handle(
      auth(KEY),
      rpc('CheckTransaction', { id: 'pm-1' }),
    );
    expect(res.result).toMatchObject({ transaction: 'pay-1', state: 1 });
    const missing = await service.handle(
      auth(KEY),
      rpc('CheckTransaction', { id: 'nope' }),
    );
    expect(missing.error?.code).toBe(-31003);
  });

  it('CancelTransaction before perform cancels without activating', async () => {
    await service.handle(auth(KEY), create());
    const res = await service.handle(
      auth(KEY),
      rpc('CancelTransaction', { id: 'pm-1', reason: 3 }),
    );
    expect(res.result).toMatchObject({ state: -1 });
    expect(payments[0].status).toBe('CANCELLED');
    const perform = await service.handle(
      auth(KEY),
      rpc('PerformTransaction', { id: 'pm-1' }),
    );
    expect(perform.error?.code).toBe(-31008);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('unknown methods are -32601', async () => {
    const res = await service.handle(auth(KEY), rpc('ChangePassword', {}));
    expect(res.error?.code).toBe(-32601);
  });
});
