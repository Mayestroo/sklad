import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { BillingService, type ProviderWebhookPayload } from './billing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('api/billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

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

  // Webhooks for Click and Payme (Public)
  @Post('webhook/click')
  clickWebhook(@Body() payload: ProviderWebhookPayload) {
    return this.billingService.processWebhook('CLICK', payload);
  }

  @Post('webhook/payme')
  paymeWebhook(@Body() payload: ProviderWebhookPayload) {
    return this.billingService.processWebhook('PAYME', payload);
  }
}
