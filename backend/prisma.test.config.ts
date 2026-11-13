import { defineConfig } from '@prisma/config';

// Prisma CLI config for the disposable test database only.
// Deliberately does NOT load .env, so it can never resolve to the application database.
const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error('DATABASE_URL_TEST must be set to use prisma.test.config.ts');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url },
});
