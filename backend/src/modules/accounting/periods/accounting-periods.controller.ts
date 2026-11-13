import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AccountingPeriodsService } from './accounting-periods.service';

export class PeriodYearParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2999)
  year!: number;
}

export class PeriodParamsDto extends PeriodYearParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/accounting/periods')
export class AccountingPeriodsController {
  constructor(private readonly periods: AccountingPeriodsService) {}

  @Get(':year')
  @RequirePermissions('accounting:view')
  list(
    @CurrentTenant() tenantId: string,
    @Param() params: PeriodYearParamsDto,
  ) {
    return this.periods.list(tenantId, params.year);
  }

  @Post(':year/:month/close')
  @RequirePermissions('accounting:close')
  close(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param() params: PeriodParamsDto,
  ) {
    return this.periods.close(tenantId, userId, {
      year: params.year,
      month: params.month,
    });
  }

  @Post(':year/:month/reopen')
  @RequirePermissions('accounting:reopen')
  reopen(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param() params: PeriodParamsDto,
  ) {
    return this.periods.reopen(tenantId, userId, {
      year: params.year,
      month: params.month,
    });
  }
}
