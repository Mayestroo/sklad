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
import { PurchasesService } from './purchases/purchases.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [
    CounterpartiesController,
    SalesInvoicesController,
    CrmController,
    PaymentsController,
    PurchasesController,
  ],
  providers: [
    CounterpartiesService,
    SalesInvoicesService,
    CrmService,
    PaymentsService,
    PurchasesService,
  ],
  exports: [
    CounterpartiesService,
    SalesInvoicesService,
    CrmService,
    PaymentsService,
    PurchasesService,
  ],
})
export class SalesModule {}
