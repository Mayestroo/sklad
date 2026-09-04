import {
  Controller,
  Get,
  Post,
  Patch,
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

  @Get('invoices/:id/returnable-items')
  @RequirePermissions('sales:view')
  getInvoiceReturnableItems(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.service.getInvoiceReturnableItems(tenantId, id);
  }

  @Get('returns')
  @RequirePermissions('sales:view')
  findAllReturns(@CurrentTenant() tenantId: string) {
    return this.service.findAllReturns(tenantId);
  }

  @Get('returns/:id')
  @RequirePermissions('sales:view')
  findOneReturn(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOneReturn(tenantId, id);
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

  @Post('returns/:id/confirm')
  @RequirePermissions('sales:post')
  confirmReturn(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.confirmReturn(tenantId, userId, id);
  }

  @Post('returns/:id/cancel')
  @RequirePermissions('sales:post')
  cancelReturn(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.cancelReturn(tenantId, userId, id);
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

  @Patch('price-lists/:id')
  @RequirePermissions('sales:create')
  updatePriceList(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body()
    body: {
      name?: { uz: string; ru: string };
      currency?: string;
      isDefault?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.service.updatePriceList(tenantId, id, body);
  }

  @Delete('price-lists/:id')
  @RequirePermissions('sales:delete')
  deletePriceList(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.service.deletePriceList(tenantId, id);
  }

  @Post('price-lists/:priceListId/items')
  @RequirePermissions('sales:create')
  upsertProductPriceItem(
    @CurrentTenant() tenantId: string,
    @Param('priceListId') priceListId: string,
    @Body() body: any,
  ) {
    if (Array.isArray(body)) {
      return this.service.bulkSetPrices(tenantId, priceListId, body);
    }
    if (body?.items && Array.isArray(body.items)) {
      return this.service.bulkSetPrices(tenantId, priceListId, body.items);
    }
    return this.service.upsertProductPrice(
      tenantId,
      priceListId,
      body.productId,
      Number(body.price),
    );
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
      Number(price),
    );
  }

  @Get('products/:productId/price')
  @RequirePermissions('sales:view')
  resolveProductPrice(
    @CurrentTenant() tenantId: string,
    @Param('productId') productId: string,
    @Query('counterpartyId') counterpartyId?: string,
    @Query('priceListId') priceListId?: string,
    @Query('currency') currency?: string,
    @Query('exchangeRate') exchangeRate?: string,
  ) {
    return this.service.resolveProductPrice(tenantId, productId, {
      counterpartyId,
      priceListId,
      currency,
      exchangeRate: exchangeRate ? Number(exchangeRate) : undefined,
    });
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
