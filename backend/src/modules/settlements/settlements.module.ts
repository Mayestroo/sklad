import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma';
import { CounterpartySettlementService } from './counterparty-settlement.service';
import { ReconciliationService } from './reconciliation.service';
import { SettlementAllocationService } from './settlement-allocation.service';

@Module({
  imports: [PrismaModule],
  providers: [CounterpartySettlementService, SettlementAllocationService, ReconciliationService],
  exports: [CounterpartySettlementService, SettlementAllocationService, ReconciliationService],
})
export class SettlementsModule {}
