import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
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

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Patch('branches/:id')
  @RequirePermissions('settings:edit')
  updateBranch(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body()
    body: {
      name?: { uz: string; ru: string };
      address?: string;
      isMain?: boolean;
    },
  ) {
    return this.tenantsService.updateBranch(tenantId, id, body);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Delete('branches/:id')
  @RequirePermissions('settings:edit')
  deleteBranch(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.tenantsService.deleteBranch(tenantId, id);
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

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Patch('warehouses/:id')
  @RequirePermissions('settings:edit')
  updateWarehouse(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body()
    body: {
      branchId?: string | null;
      name?: { uz: string; ru: string };
      address?: string;
      phone?: string;
    },
  ) {
    return this.tenantsService.updateWarehouse(tenantId, id, body);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Delete('warehouses/:id')
  @RequirePermissions('settings:edit')
  deleteWarehouse(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.tenantsService.deleteWarehouse(tenantId, id);
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
