import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

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
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateAccountDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.accountsService.create(tenantId, dto, userId);
  }

  /** Plain-language alias and deactivation (an account is never deleted). */
  @Patch(':id')
  @RequirePermissions('accounting:edit')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.accountsService.update(tenantId, id, dto, userId);
  }
}
