import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CounterpartiesService } from './counterparties.service';
import { CreateCounterpartyDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/sales/counterparties')
export class CounterpartiesController {
  constructor(private readonly counterpartiesService: CounterpartiesService) {}

  @Post()
  @RequirePermissions('sales:create')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateCounterpartyDto) {
    return this.counterpartiesService.create(tenantId, dto);
  }

  @Get()
  @RequirePermissions('sales:view')
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('type') type?: string,
  ) {
    return this.counterpartiesService.findAll(tenantId, type);
  }

  @Get(':id')
  @RequirePermissions('sales:view')
  findById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.counterpartiesService.findById(tenantId, id);
  }
}
