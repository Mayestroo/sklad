import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('api/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  // Branch Endpoints
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('branches')
  @RequirePermissions('settings:view')
  findAllBranches(@CurrentTenant() tenantId: string) {
    return this.tenantsService.findAllBranches(tenantId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post('branches')
  @RequirePermissions('settings:edit')
  createBranch(
    @CurrentTenant() tenantId: string,
    @Body() body: { name: { uz: string; ru: string }; address?: string; isMain?: boolean },
  ) {
    return this.tenantsService.createBranch(tenantId, body.name, body.address, body.isMain);
  }

  // Warehouse Endpoints
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('warehouses')
  @RequirePermissions('settings:view')
  findAllWarehouses(@CurrentTenant() tenantId: string) {
    return this.tenantsService.findAllWarehouses(tenantId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post('warehouses')
  @RequirePermissions('settings:edit')
  createWarehouse(
    @CurrentTenant() tenantId: string,
    @Body() body: { branchId?: string; name: { uz: string; ru: string }; address?: string; phone?: string },
  ) {
    return this.tenantsService.createWarehouse(tenantId, body.branchId || null, body.name, body.address, body.phone);
  }
}
