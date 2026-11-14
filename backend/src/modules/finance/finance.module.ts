import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { PrismaModule } from '../../common/prisma';
import { SettlementsModule } from '../settlements/settlements.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, SettlementsModule, AccountingModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
