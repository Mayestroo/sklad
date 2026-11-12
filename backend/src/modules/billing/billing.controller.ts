import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  HttpCode,
  Ip,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { BillingService } from './billing.service';
import {
  ClickWebhookService,
  isClickAuthFailure,
} from './webhooks/click-webhook.service';
import {
  PaymeWebhookService,
  isPaymeAuthFailure,
} from './webhooks/payme-webhook.service';
import { WebhookAuthFailureLimiter } from '../../common/rate-limit/rate-limit';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('api/billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly clickWebhooks: ClickWebhookService,
    private readonly paymeWebhooks: PaymeWebhookService,
    private readonly webhookAuthFailures: WebhookAuthFailureLimiter,
  ) {}

  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Get('status')
  @RequirePermissions('settings:view')
  getSubscriptionStatus(@CurrentTenant() tenantId: string) {
    return this.billingService.getSubscriptionStatus(tenantId);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Post('checkout')
  @RequirePermissions('settings:edit')
  createCheckout(
    @CurrentTenant() tenantId: string,
    @Body() body: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(
      tenantId,
      body.planId,
      body.method,
    );
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Get('history')
  @RequirePermissions('settings:view')
  getPaymentHistory(@CurrentTenant() tenantId: string) {
    return this.billingService.getPaymentHistory(tenantId);
  }

  // Provider callbacks. Public routes: each request is authenticated by the
  // provider's signature (Click) or Basic auth (Payme) inside the service, and
  // both protocols expect HTTP 200 with the error in the body. The bodies are
  // provider formats, parsed by the services rather than by a DTO.
  // Authenticated callbacks are never rate limited, so the providers'
  // idempotent retries always get through; only requests that fail
  // authentication are counted, per IP, and answered 429 past the limit.
  @Post('webhook/click')
  @HttpCode(200)
  @SkipThrottle()
  async clickWebhook(@Body() body: Record<string, unknown>, @Ip() ip: string) {
    const response = await this.clickWebhooks.handle(body);
    if (isClickAuthFailure(response)) {
      await this.webhookAuthFailures.recordFailure('click', ip);
    }
    return response;
  }

  @Post('webhook/payme')
  @HttpCode(200)
  @SkipThrottle()
  async paymeWebhook(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Ip() ip: string,
  ) {
    const response = await this.paymeWebhooks.handle(authorization, body);
    if (isPaymeAuthFailure(response)) {
      await this.webhookAuthFailures.recordFailure('payme', ip);
    }
    return response;
  }
}
