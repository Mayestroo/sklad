import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsService } from './accounts/accounts.service';
import { JournalController } from './journal/journal.controller';
import { JournalService } from './journal/journal.service';
import { AccountingReportsController } from './reports/accounting-reports.controller';
import { AccountingReportsService } from './reports/accounting-reports.service';

@Module({
  controllers: [
    AccountsController,
    JournalController,
    AccountingReportsController,
  ],
  providers: [
    AccountsService,
    JournalService,
    AccountingReportsService,
  ],
  exports: [
    AccountsService,
    JournalService,
    AccountingReportsService,
  ],
})
export class AccountingModule {}
