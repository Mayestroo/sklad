import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/inventory/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequirePermissions('inventory:create')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(tenantId, dto);
  }

  @Get()
  @RequirePermissions('inventory:view')
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('category') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(tenantId, categoryId, search);
  }

  @Get('low-stock')
  @RequirePermissions('inventory:view')
  findLowStockAlerts(@CurrentTenant() tenantId: string) {
    return this.productsService.findLowStockAlerts(tenantId);
  }

  @Get('barcode/:code')
  @RequirePermissions('inventory:view')
  findByBarcode(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.productsService.findByBarcode(tenantId, code);
  }

  @Get(':id')
  @RequirePermissions('inventory:view')
  findById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productsService.findById(tenantId, id);
  }
}
