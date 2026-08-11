import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { SalesInvoicesService } from './sales-invoices.service';
import { CreateSalesInvoiceDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/sales/invoices')
export class SalesInvoicesController {
  constructor(private readonly invoicesService: SalesInvoicesService) {}

  @Post()
  @RequirePermissions('sales:create')
  createAndPost(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSalesInvoiceDto,
  ) {
    return this.invoicesService.createAndPostInvoice(tenantId, dto, userId);
  }

  @Get()
  @RequirePermissions('sales:view')
  findAll(@CurrentTenant() tenantId: string) {
    return this.invoicesService.findAllByTenant(tenantId);
  }

  @Get(':id')
  @RequirePermissions('sales:view')
  findById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findById(tenantId, id);
  }
}
