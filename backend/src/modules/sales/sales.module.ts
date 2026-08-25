import { Module } from '@nestjs/common';
import { CounterpartiesController } from './counterparties/counterparties.controller';
import { CounterpartiesService } from './counterparties/counterparties.service';
import { SalesInvoicesController } from './invoices/sales-invoices.controller';
import { SalesInvoicesService } from './invoices/sales-invoices.service';
import { CrmController } from './crm/crm.controller';
import { CrmService } from './crm/crm.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { PurchasesController } from './purchases/purchases.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesOrdersController } from './orders/sales-orders.controller';
import { SalesOrdersService } from './orders/sales-orders.service';

@Module({
  imports: [AccountingModule, InventoryModule],
  controllers: [
    CounterpartiesController,
    SalesInvoicesController,
    CrmController,
    PaymentsController,
    PurchasesController,
    SalesOrdersController,
  ],
  providers: [
    CounterpartiesService,
    SalesInvoicesService,
    CrmService,
    PaymentsService,
    PurchasesService,
    SalesOrdersService,
  ],
  exports: [
    CounterpartiesService,
    SalesInvoicesService,
    CrmService,
    PaymentsService,
    PurchasesService,
    SalesOrdersService,
  ],
})
export class SalesModule {}
