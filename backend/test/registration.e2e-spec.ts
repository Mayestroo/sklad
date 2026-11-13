import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { useTestDatabase } from './use-test-database';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  MAIL_TRANSPORT,
  type MailMessage,
} from '../src/common/mail/mail-transport';

useTestDatabase();

/**
 * D3: sign-up end to end over HTTP against the disposable test database:
 * register -> confirmation email -> confirm -> signed in. Mail goes to an
 * in-memory transport instead of the console one.
 */
describe('Sign-up by email confirmation (e2e)', () => {
  let app: INestApplication<App>;
  const outbox: MailMessage[] = [];
  const run = Date.now().toString(36);
  const email = `owner-${run}@example.com`;
  const slug = `e2e-${run}`;

  const body = (overrides: Record<string, unknown> = {}) => ({
    companyName: { uz: 'E2E MChJ', ru: 'E2E ООО' },
    companySlug: slug,
    defaultLanguage: 'uz',
    adminEmail: email,
    adminPassword: 'secret123',
    adminFirstName: 'Ali',
    adminLastName: 'Valiyev',
    adminPreferredLanguage: 'uz',
    ...overrides,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue({ send: async (m: MailMessage) => void outbox.push(m) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    // Sign-up needs the system company_admin role. The auto-seed only runs
    // on an empty database, and the integration suites leave rows behind.
    const prisma = app.get(PrismaService);
    const role = await prisma.role.findFirst({
      where: { slug: 'company_admin', tenantId: null },
    });
    if (!role) {
      await prisma.role.create({
        data: {
          slug: 'company_admin',
          name: { uz: 'Kompaniya admini', ru: 'Администратор компании' },
          isSystemRole: true,
        },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const tokenIn = (m: MailMessage) =>
    /register\/confirm\?token=([A-Za-z0-9_-]+)/.exec(m.text)?.[1];

  it('registers, confirms the emailed link and signs the new admin in', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body())
      .expect(202);
    expect(registered.body).toEqual({ status: 'CONFIRMATION_SENT' });
    expect(registered.body).not.toHaveProperty('tokens');

    const message = outbox.find((m) => m.to === email);
    const token = message && tokenIn(message);
    expect(token).toBeTruthy();

    // Not signed in yet: the account does not exist before confirmation.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'secret123' })
      .expect(401);

    const confirmed = await request(app.getHttpServer())
      .post('/api/auth/register/confirm')
      .send({ token })
      .expect(201);
    expect(confirmed.body.company.slug).toBe(slug);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${confirmed.body.tokens.accessToken}`)
      .expect(200);
    expect(me.body.user.email).toBe(email);

    // The link works once.
    await request(app.getHttpServer())
      .post('/api/auth/register/confirm')
      .send({ token })
      .expect(400);
  });

  it('answers a taken email exactly like a free one', async () => {
    outbox.length = 0;
    const taken = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body({ companySlug: `${slug}-again` }))
      .expect(202);
    expect(taken.body).toEqual({ status: 'CONFIRMATION_SENT' });

    const notice = outbox.find((m) => m.to === email);
    expect(notice).toBeDefined();
    expect(notice && tokenIn(notice)).toBeUndefined();
  });
});
