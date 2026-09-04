import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateCompanySettingsDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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

  // Branch Endpoints
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Get('branches')
  findAllBranches(@CurrentTenant() tenantId: string) {
    return this.tenantsService.findAllBranches(tenantId);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Post('branches')
  @RequirePermissions('settings:edit')
  createBranch(
    @CurrentTenant() tenantId: string,
    @Body()
    body: {
      name: { uz: string; ru: string };
      address?: string;
      isMain?: boolean;
    },
  ) {
    return this.tenantsService.createBranch(
      tenantId,
      body.name,
      body.address,
      body.isMain,
    );
  }

  // Warehouse Endpoints
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Get('warehouses')
  findAllWarehouses(@CurrentTenant() tenantId: string) {
    return this.tenantsService.findAllWarehouses(tenantId);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Post('warehouses')
  @RequirePermissions('settings:edit')
  createWarehouse(
    @CurrentTenant() tenantId: string,
    @Body()
    body: {
      branchId?: string;
      name: { uz: string; ru: string };
      address?: string;
      phone?: string;
    },
  ) {
    return this.tenantsService.createWarehouse(
      tenantId,
      body.branchId || null,
      body.name,
      body.address,
      body.phone,
    );
  }

  // Settings Endpoints
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Get('settings')
  getSettings(@CurrentTenant() tenantId: string) {
    return this.tenantsService.getSettings(tenantId);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Patch('settings')
  @RequirePermissions('settings:edit')
  updateSettings(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateCompanySettingsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.updateSettings(tenantId, dto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }
}
