import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { autoSeedIfEmpty } from './seed-helper';

/**
 * API contract: money and quantities travel as JSON numbers, matching
 * shared/types. Prisma's Decimal serializes to a string by default, which made
 * documents fail @IsNumber() validation when the UI saved them back unchanged.
 * Every Decimal column is at most 15 significant digits, so the conversion to
 * a double is exact.
 */
(Prisma.Decimal.prototype as { toJSON: () => unknown }).toJSON = function (
  this: Prisma.Decimal,
) {
  return this.toNumber();
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * The pool behind the driver adapter. $disconnect() does not end a pool the
   * caller created, so onModuleDestroy ends it; otherwise its sockets keep the
   * process alive after app.close().
   */
  private readonly pgPool: Pool;
  private poolEnded = false;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString?.trim()) {
      throw new Error(
        'DATABASE_URL is not set. Set it in backend/.env (see .env.example).',
      );
    }
    const maskedUrl = connectionString.replace(/:[^:@]+@/, ':****@');
    console.log(`[PRISMA_INIT] Connecting to Database URL: ${maskedUrl}`);
    const isCloudDb =
      connectionString.includes('neon.tech') ||
      connectionString.includes('sslmode=require');
    const pool = new Pool({
      connectionString,
      ssl: isCloudDb ? { rejectUnauthorized: false } : undefined,
    });
    const adapter = new PrismaPg(pool);
    super({
      adapter,
      // Posting a document (FIFO batches, settlements, journal entries) is one
      // interactive transaction; over a remote DB it exceeds Prisma's 5 s default.
      transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    });
    this.pgPool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    await autoSeedIfEmpty(this);
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (!this.poolEnded) {
      this.poolEnded = true;
      await this.pgPool.end();
    }
  }
}
