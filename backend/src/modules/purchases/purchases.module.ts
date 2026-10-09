import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { AdditionalExpensesController } from './additional-expenses.controller';
import { AdditionalExpensesService } from './additional-expenses.service';
import { SettlementsModule } from '../settlements/settlements.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [SettlementsModule, AccountingModule],
  controllers: [PurchasesController, AdditionalExpensesController],
  providers: [PurchasesService, AdditionalExpensesService],
  exports: [PurchasesService, AdditionalExpensesService],
})
export class PurchasesModule {}
