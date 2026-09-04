import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

// Common
import { PrismaModule } from './common/prisma';
import { I18nMiddleware } from './common/middleware/i18n.middleware';
import { EventsModule } from './common/websockets/events.module';

// Feature modules
import { HealthModule } from './modules/health/health.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BillingModule } from './modules/billing/billing.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { FinanceModule } from './modules/finance/finance.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { ServicesModule } from './modules/services/services.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Database & Audit & Real-time WebSockets
    PrismaModule,
    AuditModule,
    EventsModule,

    // Feature modules
    HealthModule,
    TenantsModule,
    AuthModule,
    UsersModule,
    InventoryModule,
    SalesModule,
    PurchasesModule,
    AccountingModule,
    AnalyticsModule,
    BillingModule,
    SuperAdminModule,
    FinanceModule,
    DashboardModule,
    ServicesModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(I18nMiddleware).forRoutes('*');
  }
}
