import { Module } from '@nestjs/common';
import { OpeningBalancesService } from './opening-balances.service';
import { OpeningBalancesImportService } from './opening-balances-import.service';
import { OpeningBalancesController } from './opening-balances.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OpeningBalancesController],
  providers: [OpeningBalancesService, OpeningBalancesImportService],
  exports: [OpeningBalancesService, OpeningBalancesImportService],
})
export class OpeningBalancesModule {}
