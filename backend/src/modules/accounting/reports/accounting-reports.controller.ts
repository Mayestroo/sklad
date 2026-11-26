import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccountingReportsService } from './accounting-reports.service';
import { CardAccountsDto, PeriodQueryDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/accounting')
export class AccountingReportsController {
  constructor(private readonly reportsService: AccountingReportsService) {}

  /** Simple mode: six cards, health banner, last five movements (TZ 5). */
  @Get('summary')
  @RequirePermissions('accounting:view')
  getSummary(@CurrentTenant() tenantId: string, @Query() q: PeriodQueryDto) {
    return this.reportsService.getSummary(tenantId, q.from, q.to);
  }

  /** Automatic checks behind the status banner (TZ 11). */
  @Get('health')
  @RequirePermissions('accounting:view')
  getHealth(@CurrentTenant() tenantId: string) {
    return this.reportsService.getHealth(tenantId);
  }

  @Get('trial-balance')
  @RequirePermissions('accounting:view')
  getTrialBalance(
    @CurrentTenant() tenantId: string,
    @Query() q: PeriodQueryDto,
  ) {
    return this.reportsService.getTrialBalance(tenantId, q.from, q.to);
  }

  /** Former path of the trial balance; kept for old links and clients. */
  @Get('reports/osv')
  @RequirePermissions('accounting:view')
  getOsv(@CurrentTenant() tenantId: string, @Query() q: PeriodQueryDto) {
    return this.reportsService.getTrialBalance(tenantId, q.from, q.to);
  }

  @Get('reports/statements')
  @RequirePermissions('accounting:view')
  getStatements(@CurrentTenant() tenantId: string, @Query() q: PeriodQueryDto) {
    return this.reportsService.getFinancialStatements(tenantId, q.from, q.to);
  }

  /** profit-loss | balance | cash-flow (TZ 7). */
  @Get('reports/:type')
  @RequirePermissions('accounting:view')
  getReport(
    @CurrentTenant() tenantId: string,
    @Param('type') type: string,
    @Query() q: PeriodQueryDto,
  ) {
    return this.reportsService.getReport(tenantId, type, q.from, q.to);
  }

  /** Which accounts feed the balance cards; an administrator's setting (TZ 14). */
  @Put('settings/cards')
  @RequirePermissions('settings:edit')
  updateCardAccounts(
    @CurrentTenant() tenantId: string,
    @Body() dto: CardAccountsDto,
  ) {
    return this.reportsService.updateCardAccounts(tenantId, dto);
  }
}
