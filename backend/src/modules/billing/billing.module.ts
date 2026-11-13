import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ClickWebhookService } from './webhooks/click-webhook.service';
import { PaymeWebhookService } from './webhooks/payme-webhook.service';
import { RateLimitModule } from '../../common/rate-limit/rate-limit';

@Module({
  // WebhookAuthFailureLimiter (failed Click/Payme callback limit)
  imports: [RateLimitModule],
  controllers: [BillingController],
  providers: [BillingService, ClickWebhookService, PaymeWebhookService],
  exports: [BillingService],
})
export class BillingModule {}
