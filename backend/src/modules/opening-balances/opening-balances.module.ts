import { Module } from '@nestjs/common';
import { OpeningBalancesService } from './opening-balances.service';
import { OpeningBalancesImportService } from './opening-balances-import.service';
import { OpeningBalancesController } from './opening-balances.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SettlementsModule } from '../settlements/settlements.module';

@Module({
  imports: [PrismaModule, SettlementsModule],
  controllers: [OpeningBalancesController],
  providers: [OpeningBalancesService, OpeningBalancesImportService],
  exports: [OpeningBalancesService, OpeningBalancesImportService],
})
export class OpeningBalancesModule {}
