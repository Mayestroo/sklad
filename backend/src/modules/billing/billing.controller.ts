import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { ClickWebhookService } from './webhooks/click-webhook.service';
import { PaymeWebhookService } from './webhooks/payme-webhook.service';
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
  @Post('webhook/click')
  @HttpCode(200)
  clickWebhook(@Body() body: Record<string, unknown>) {
    return this.clickWebhooks.handle(body);
  }

  @Post('webhook/payme')
  @HttpCode(200)
  paymeWebhook(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.paymeWebhooks.handle(authorization, body);
  }
}
