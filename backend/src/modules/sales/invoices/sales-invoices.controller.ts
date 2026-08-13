import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SalesInvoicesService } from './sales-invoices.service';
import { CreateSalesInvoiceDto } from '../dto/create-sales-invoice.dto';
import { FilterSalesInvoicesDto } from '../dto/filter-sales-invoices.dto';
import { CreateSalesReturnDto } from '../dto/create-sales-return.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/sales')
export class SalesInvoicesController {
  constructor(private readonly service: SalesInvoicesService) {}

  // ─── SUMMARY / STATS ──────────────────────────────────────────

  @Get('summary')
  @RequirePermissions('sales:view')
  getSummary(@CurrentTenant() tenantId: string) {
    return this.service.getSummaryStats(tenantId);
  }

  // ─── INVOICES ─────────────────────────────────────────────────

  @Get('invoices')
  @RequirePermissions('sales:view')
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterSalesInvoicesDto,
  ) {
    return this.service.findAll(tenantId, filters);
  }

  @Get('invoices/:id')
  @RequirePermissions('sales:view')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Post('invoices')
  @RequirePermissions('sales:create')
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSalesInvoiceDto,
  ) {
    return this.service.createInvoice(tenantId, userId, dto);
  }

  @Post('invoices/:id/post')
  @RequirePermissions('sales:post')
  postInvoice(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.postInvoice(tenantId, userId, id);
  }

  @Post('invoices/:id/unpost')
  @RequirePermissions('sales:post')
  unpostInvoice(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.unpostInvoice(tenantId, userId, id);
  }

  @Delete('invoices/:id')
  @RequirePermissions('sales:delete')
  deleteInvoice(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.deleteInvoice(tenantId, id);
  }

  // ─── RETURNS ──────────────────────────────────────────────────

  @Get('returns')
  @RequirePermissions('sales:view')
  findAllReturns(@CurrentTenant() tenantId: string) {
    return this.service.findAllReturns(tenantId);
  }

  @Post('returns')
  @RequirePermissions('sales:create')
  createReturn(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSalesReturnDto,
  ) {
    return this.service.createReturn(tenantId, userId, dto);
  }

  // ─── PRICE LISTS ──────────────────────────────────────────────

  @Get('price-lists')
  @RequirePermissions('sales:view')
  findAllPriceLists(@CurrentTenant() tenantId: string) {
    return this.service.findAllPriceLists(tenantId);
  }

  @Post('price-lists')
  @RequirePermissions('sales:create')
  createPriceList(
    @CurrentTenant() tenantId: string,
    @Body()
    body: {
      name: { uz: string; ru: string };
      currency?: string;
      isDefault?: boolean;
    },
  ) {
    return this.service.createPriceList(tenantId, body);
  }

  @Post('price-lists/:priceListId/prices/:productId')
  @RequirePermissions('sales:create')
  upsertProductPrice(
    @CurrentTenant() tenantId: string,
    @Param('priceListId') priceListId: string,
    @Param('productId') productId: string,
    @Body('price') price: number,
  ) {
    return this.service.upsertProductPrice(
      tenantId,
      priceListId,
      productId,
      price,
    );
  }

  // ─── CUSTOMER PROFILE ─────────────────────────────────────────

  @Get('customers/:id/profile')
  @RequirePermissions('sales:view')
  getCustomerProfile(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.service.getCustomerProfile(tenantId, id);
  }
}
