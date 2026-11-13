import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

/**
 * Resolves the whole dependency-injection graph without starting the app or
 * touching a database (compile() does not run onModuleInit, so Prisma never
 * connects). A provider that a module forgets to import or export makes the
 * API fail at startup; this catches it in the unit suite.
 */
describe('AppModule', () => {
  const saved = { ...process.env };

  beforeAll(() => {
    // Never a real database: the pool is created lazily and never used here.
    process.env.DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/never_used';
    process.env.JWT_SECRET = 'unit-test-access-secret-0123456789';
    process.env.JWT_REFRESH_SECRET = 'unit-test-refresh-secret-9876543210';
  });

  afterAll(() => {
    process.env = saved;
  });

  it('every provider, controller and guard can be constructed', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
