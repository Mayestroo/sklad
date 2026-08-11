import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/inventory/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermissions('inventory:create')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(tenantId, dto);
  }

  @Get()
  @RequirePermissions('inventory:view')
  findAll(@CurrentTenant() tenantId: string) {
    return this.categoriesService.findAll(tenantId);
  }

  @Get(':id')
  @RequirePermissions('inventory:view')
  findById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.categoriesService.findById(tenantId, id);
  }
}
