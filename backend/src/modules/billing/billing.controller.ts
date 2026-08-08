import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('api/billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('status')
  @RequirePermissions('settings:view')
  getSubscriptionStatus(@CurrentTenant() tenantId: string) {
    return this.billingService.getSubscriptionStatus(tenantId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post('checkout')
  @RequirePermissions('settings:edit')
  createCheckout(
    @CurrentTenant() tenantId: string,
    @Body() body: { planId: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'; method: 'CLICK' | 'PAYME' | 'BANK_TRANSFER' },
  ) {
    return this.billingService.createCheckout(tenantId, body.planId, body.method);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('history')
  @RequirePermissions('settings:view')
  getPaymentHistory(@CurrentTenant() tenantId: string) {
    return this.billingService.getPaymentHistory(tenantId);
  }

  // Webhooks for Click and Payme (Public)
  @Post('webhook/click')
  clickWebhook(@Body() payload: any) {
    return this.billingService.processWebhook('CLICK', payload);
  }

  @Post('webhook/payme')
  paymeWebhook(@Body() payload: any) {
    return this.billingService.processWebhook('PAYME', payload);
  }
}
