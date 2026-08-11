import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/accounting/accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @RequirePermissions('accounting:view')
  findAll(@CurrentTenant() tenantId: string) {
    return this.accountsService.findAll(tenantId);
  }

  @Post()
  @RequirePermissions('accounting:create')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(tenantId, dto);
  }
}
