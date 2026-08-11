import { defineConfig } from '@prisma/config';

export default defineConfig({
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://crm_user:crm_password@localhost:5432/crm_dev?schema=public',
  },
});
