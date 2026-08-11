import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('kpi')
  @RequirePermissions('analytics:view')
  getKpiSummary(@CurrentTenant() tenantId: string) {
    return this.analyticsService.getKpiSummary(tenantId);
  }

  @Get('sales-trend')
  @RequirePermissions('analytics:view')
  getSalesTrend(@CurrentTenant() tenantId: string) {
    return this.analyticsService.getSalesTrend(tenantId);
  }

  @Get('categories')
  @RequirePermissions('analytics:view')
  getCategoryBreakdown(@CurrentTenant() tenantId: string) {
    return this.analyticsService.getCategoryBreakdown(tenantId);
  }

  @Get('top-products')
  @RequirePermissions('analytics:view')
  getTopProducts(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getTopProducts(tenantId, limit ? Number(limit) : 10);
  }

  @Get('top-clients')
  @RequirePermissions('analytics:view')
  getTopClients(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getTopClients(tenantId, limit ? Number(limit) : 5);
  }

  @Get('ratios')
  @RequirePermissions('analytics:view')
  getFinancialRatios(@CurrentTenant() tenantId: string) {
    return this.analyticsService.getFinancialRatios(tenantId);
  }
}
