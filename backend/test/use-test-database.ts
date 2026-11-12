import 'dotenv/config';

/**
 * Points DATABASE_URL at the disposable test database before any PrismaService
 * is constructed. DB-backed tests (e2e, *.int-spec.ts) must never run against
 * the application database from .env, which may hold real tenant data.
 */
export function useTestDatabase(): void {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Point it at a disposable test database to run DB-backed tests.',
    );
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL_TEST must differ from DATABASE_URL; refusing to run DB-backed tests against the application database.',
    );
  }
  process.env.DATABASE_URL = testUrl;
}
