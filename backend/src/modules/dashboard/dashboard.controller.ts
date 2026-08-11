import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @RequirePermissions('analytics:view')
  getFullDashboard(
    @CurrentTenant() tenantId: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('currency') currency?: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month',
  ) {
    return this.dashboardService.getFullDashboard(tenantId, { date_from, date_to, currency, granularity });
  }

  @Get('finance')
  @RequirePermissions('analytics:view')
  getFinanceKPIs(
    @CurrentTenant() tenantId: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('currency') currency?: string,
  ) {
    return this.dashboardService.getFinanceKPIs(tenantId, { date_from, date_to, currency });
  }

  @Get('sales')
  @RequirePermissions('analytics:view')
  getSalesKPIs(
    @CurrentTenant() tenantId: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month',
  ) {
    return this.dashboardService.getSalesKPIs(tenantId, { date_from, date_to, granularity });
  }

  @Get('debts')
  @RequirePermissions('analytics:view')
  getDebts(@CurrentTenant() tenantId: string) {
    return this.dashboardService.getDebts(tenantId);
  }

  @Get('cash-flow')
  @RequirePermissions('analytics:view')
  getCashFlow(
    @CurrentTenant() tenantId: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('currency') currency?: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month',
  ) {
    return this.dashboardService.getCashFlow(tenantId, { date_from, date_to, currency, granularity });
  }

  @Get('transactions')
  @RequirePermissions('analytics:view')
  getRecentTransactions(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit?: number,
  ) {
    return this.dashboardService.getRecentTransactions(tenantId, limit ? Number(limit) : 10);
  }
}
