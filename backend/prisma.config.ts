import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    // No fallback: commands that need the database fail if DATABASE_URL is unset.
    url: env('DATABASE_URL'),
  },
});
