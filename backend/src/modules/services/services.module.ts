import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { AccountingModule } from '../accounting/accounting.module';
import { SettlementsModule } from '../settlements/settlements.module';

@Module({
  imports: [AccountingModule, SettlementsModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
