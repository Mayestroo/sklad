import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://crm_user:crm_password@localhost:5432/crm_dev?schema=public';
    const isCloudDb =
      connectionString.includes('neon.tech') ||
      connectionString.includes('sslmode=require');
    const pool = new Pool({
      connectionString,
      ssl: isCloudDb ? { rejectUnauthorized: false } : undefined,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Returns a Prisma client scoped to a specific tenant.
   * Automatically injects tenant_id into all queries on tenant-scoped models.
   */
  forTenant(tenantId: string) {
    return this.$extends({
      query: {
        $allModels: {
          async findMany({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async findFirst({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async findUnique({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              return query({ ...args, where: { ...args.where } });
            }
            return query(args);
          },
          async create({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              args.data = { ...args.data, tenantId };
            }
            return query(args);
          },
          async createMany({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              if (Array.isArray(args.data)) {
                args.data = args.data.map((d: any) => ({
                  ...d,
                  tenantId,
                }));
              } else {
                args.data = { ...args.data, tenantId };
              }
            }
            return query(args);
          },
          async update({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async updateMany({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async delete({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async deleteMany({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async count({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async aggregate({ model, args, query }: { model?: string; args: any; query: (args: any) => Promise<any> }) {
            if (isTenantScopedModel(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
        },
      },
    });
  }
}

/** Models that have a tenant_id column and must be scoped */
const TENANT_SCOPED_MODELS = new Set([
  'User',
  'Role',
  'Branch',
  'Warehouse',
  'TaxRate',
  'AuditLog',
  'Category',
  'Product',
  'ProductVariant',
  'StockLevel',
  'InventoryDocument',
  'StockTransfer',
  'Counterparty',
  'SalesOrder',
  'SalesInvoice',
  'PurchaseOrder',
  'Deal',
  'Payment',
  'Account',
  'JournalEntry',
  'JournalLine',
  'Subscription',
  'SubscriptionPayment',
  'SupportTicket',
]);

function isTenantScopedModel(model: string | undefined): boolean {
  return model !== undefined && TENANT_SCOPED_MODELS.has(model);
}
