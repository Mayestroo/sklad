import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccountingReportsService } from './accounting-reports.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/accounting/reports')
export class AccountingReportsController {
  constructor(private readonly reportsService: AccountingReportsService) {}

  @Get('osv')
  @RequirePermissions('accounting:view')
  getTrialBalance(@CurrentTenant() tenantId: string) {
    return this.reportsService.getTrialBalance(tenantId);
  }

  @Get('statements')
  @RequirePermissions('accounting:view')
  getStatements(@CurrentTenant() tenantId: string) {
    return this.reportsService.getFinancialStatements(tenantId);
  }
}
