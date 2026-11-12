import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AuthController } from '../../modules/auth/auth.controller';
import { AuthService } from '../../modules/auth/auth.service';
import { BillingController } from '../../modules/billing/billing.controller';
import { BillingService } from '../../modules/billing/billing.service';
import { ClickWebhookService } from '../../modules/billing/webhooks/click-webhook.service';
import { PaymeWebhookService } from '../../modules/billing/webhooks/payme-webhook.service';
import { PrismaService } from '../prisma';
import {
  DEFAULT_RATE_LIMIT,
  RateLimitModule,
  STRICT_RATE_LIMITS,
  configureTrustProxy,
} from './rate-limit';

const PAYME_KEY = 'payme-test-key';
const paymeAuth = `Basic ${Buffer.from(`Paycom:${PAYME_KEY}`).toString('base64')}`;

describe('rate limiting (global ThrottlerGuard)', () => {
  let app: NestExpressApplication;
  let authService: { login: jest.Mock; registerCompany: jest.Mock };

  beforeEach(async () => {
    authService = {
      login: jest.fn().mockResolvedValue({ accessToken: 't' }),
      registerCompany: jest.fn().mockResolvedValue({ ok: true }),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [RateLimitModule],
      controllers: [AuthController, BillingController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: BillingService, useValue: { getPlans: () => [] } },
        ClickWebhookService,
        PaymeWebhookService,
        // Webhook requests below either fail authentication or are
        // malformed, so neither service reaches the database.
        { provide: PrismaService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'PAYME_SECRET_KEY' ? PAYME_KEY : undefined,
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    // As in production behind one proxy: the client IP is X-Forwarded-For.
    configureTrustProxy(app, '1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(() => app.close());

  const login = (ip: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'a@b.uz', password: 'secret123' });
  const register = (ip: string) =>
    request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({});
  const plans = (ip: string) =>
    request(app.getHttpServer())
      .get('/api/billing/plans')
      .set('X-Forwarded-For', ip);
  const click = (ip: string) =>
    request(app.getHttpServer())
      .post('/api/billing/webhook/click')
      .set('X-Forwarded-For', ip)
      .send({ action: '0', sign_string: 'forged' });
  const payme = (ip: string, authorization?: string) => {
    const req = request(app.getHttpServer())
      .post('/api/billing/webhook/payme')
      .set('X-Forwarded-For', ip);
    if (authorization) req.set('Authorization', authorization);
    return req.send({ id: 1 });
  };

  async function expectStatuses(
    send: () => request.Test,
    count: number,
    status: number,
  ) {
    for (let i = 0; i < count; i++) {
      const res = await send();
      expect([i + 1, res.status]).toEqual([i + 1, status]);
    }
  }

  it('answers 429 to the login request after the limit, within the window', async () => {
    const { limit } = STRICT_RATE_LIMITS.login;
    await expectStatuses(() => login('203.0.113.1'), limit, 201);
    await expectStatuses(() => login('203.0.113.1'), 1, 429);
    expect(authService.login).toHaveBeenCalledTimes(limit);
  });

  it('answers 429 to the registration request after the limit', async () => {
    const { limit } = STRICT_RATE_LIMITS.register;
    // Validation fails (400) but the attempt still counts.
    await expectStatuses(() => register('203.0.113.1'), limit, 400);
    await expectStatuses(() => register('203.0.113.1'), 1, 429);
  });

  it('counts limits per IP: another client can still log in', async () => {
    const { limit } = STRICT_RATE_LIMITS.login;
    for (let i = 0; i < limit; i++) await login('203.0.113.1');
    await expectStatuses(() => login('203.0.113.1'), 1, 429);
    await expectStatuses(() => login('203.0.113.2'), limit, 201);
  });

  it('counts limits per route: a blocked login does not block other routes', async () => {
    const { limit } = STRICT_RATE_LIMITS.login;
    for (let i = 0; i <= limit; i++) await login('203.0.113.1');
    await expectStatuses(() => login('203.0.113.1'), 1, 429);
    await expectStatuses(() => plans('203.0.113.1'), 1, 200);
    await expectStatuses(() => register('203.0.113.1'), 1, 400);
  });

  it('leaves normal usage alone and limits only a flood on ordinary routes', async () => {
    await expectStatuses(
      () => plans('203.0.113.1'),
      DEFAULT_RATE_LIMIT.limit,
      200,
    );
    await expectStatuses(() => plans('203.0.113.1'), 1, 429);
  }, 30_000);

  it('limits Click callbacks that fail the signature check', async () => {
    const { limit } = STRICT_RATE_LIMITS.webhookAuthFailure;
    for (let i = 0; i < limit; i++) {
      const res = await click('198.51.100.7');
      expect(res.status).toBe(200);
      expect(res.body.error).toBe(-1); // SIGN CHECK FAILED, provider format
    }
    await expectStatuses(() => click('198.51.100.7'), 1, 429);
    await expectStatuses(() => click('198.51.100.8'), 1, 200);
  });

  it('limits Payme requests with bad credentials but never authenticated retries', async () => {
    const { limit } = STRICT_RATE_LIMITS.webhookAuthFailure;
    await expectStatuses(() => payme('198.51.100.7', 'Basic bad'), limit, 200);
    await expectStatuses(() => payme('198.51.100.7', 'Basic bad'), 1, 429);

    // Same IP, authenticated: well past both the failure and default limits.
    for (let i = 0; i < DEFAULT_RATE_LIMIT.limit + 5; i++) {
      const res = await payme('198.51.100.7', paymeAuth);
      expect(res.status).toBe(200);
      expect(res.body.error.code).toBe(-32600); // reached the RPC layer
    }
  }, 30_000);
});

describe('configureTrustProxy', () => {
  const fakeApp = () => {
    const set = jest.fn();
    return { app: { set } as unknown as NestExpressApplication, set };
  };

  it('trusts nothing when unset', () => {
    const { app, set } = fakeApp();
    configureTrustProxy(app, undefined);
    configureTrustProxy(app, ' ');
    expect(set).not.toHaveBeenCalled();
  });

  it('takes a hop count or proxy addresses', () => {
    const { app, set } = fakeApp();
    configureTrustProxy(app, '1');
    configureTrustProxy(app, 'loopback, 10.0.0.0/8');
    expect(set).toHaveBeenNthCalledWith(1, 'trust proxy', 1);
    expect(set).toHaveBeenNthCalledWith(
      2,
      'trust proxy',
      'loopback, 10.0.0.0/8',
    );
  });

  it('refuses "true", which would let clients spoof their IP', () => {
    const { app } = fakeApp();
    expect(() => configureTrustProxy(app, 'true')).toThrow(/spoof/);
  });
});
