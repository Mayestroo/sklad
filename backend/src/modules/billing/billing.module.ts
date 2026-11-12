import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ClickWebhookService } from './webhooks/click-webhook.service';
import { PaymeWebhookService } from './webhooks/payme-webhook.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, ClickWebhookService, PaymeWebhookService],
  exports: [BillingService],
})
export class BillingModule {}
