import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePurchaseReceiptDto } from './dto/create-purchase-receipt.dto';
import { FilterPurchaseReceiptsDto } from './dto/filter-purchase-receipts.dto';
import { CreatePurchaseExpenseDto } from './dto/create-purchase-expense.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  // ─── SUMMARY KPI STATS ────────────────────────────────────────

  @Get('summary')
  @RequirePermissions('inventory:view')
  async getSummaryStats(@CurrentTenant() tenantId: string) {
    return this.purchasesService.getSummaryStats(tenantId);
  }

  // ─── PURCHASE RECEIPTS ────────────────────────────────────────

  @Get('receipts')
  @RequirePermissions('inventory:view')
  async findAllReceipts(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterPurchaseReceiptsDto,
  ) {
    return this.purchasesService.findAllReceipts(tenantId, filters);
  }

  @Get('receipts/:id')
  @RequirePermissions('inventory:view')
  async findOneReceipt(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.purchasesService.findOneReceipt(tenantId, id);
  }

  @Post('receipts')
  @RequirePermissions('inventory:create')
  async createReceipt(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreatePurchaseReceiptDto,
  ) {
    return this.purchasesService.createReceipt(tenantId, user?.id, dto);
  }

  @Put('receipts/:id')
  @RequirePermissions('inventory:edit')
  async updateReceipt(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreatePurchaseReceiptDto,
  ) {
    return this.purchasesService.updateReceipt(tenantId, id, dto);
  }

  @Post('receipts/:id/post')
  @RequirePermissions('inventory:edit')
  async postReceipt(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.purchasesService.postReceipt(tenantId, user?.id, id);
  }

  @Post('receipts/:id/unpost')
  @RequirePermissions('inventory:edit')
  async unpostReceipt(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.purchasesService.unpostReceipt(tenantId, user?.id, id);
  }

  @Post('receipts/:id/pay')
  @RequirePermissions('inventory:edit')
  async payReceipt(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    dto: {
      amount: number;
      cashAccountId: string;
      note?: string;
      paymentDate?: string;
    },
  ) {
    return this.purchasesService.payPurchaseReceipt(
      tenantId,
      user?.id,
      id,
      dto,
    );
  }

  @Delete('receipts/:id')
  @RequirePermissions('inventory:delete')
  async deleteReceipt(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.purchasesService.deleteReceipt(tenantId, id);
  }

  // ─── ADDITIONAL EXPENSES ──────────────────────────────────────

  @Post('expenses')
  @RequirePermissions('inventory:create')
  async addExpense(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreatePurchaseExpenseDto,
  ) {
    return this.purchasesService.addExpense(tenantId, dto);
  }

  @Get('expenses')
  @RequirePermissions('inventory:view')
  async findAllExpenses(@CurrentTenant() tenantId: string) {
    return this.purchasesService.findAllExpenses(tenantId);
  }

  // ─── RETURNS TO SUPPLIER ──────────────────────────────────────

  @Post('returns')
  @RequirePermissions('inventory:create')
  async createReturn(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreatePurchaseReturnDto,
  ) {
    return this.purchasesService.createReturn(tenantId, user?.id, dto);
  }

  @Get('returns')
  @RequirePermissions('inventory:view')
  async findAllReturns(@CurrentTenant() tenantId: string) {
    return this.purchasesService.findAllReturns(tenantId);
  }

  @Post('returns/:id/cancel')
  @RequirePermissions('inventory:delete')
  async cancelReturn(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.purchasesService.cancelReturn(tenantId, user?.id, id);
  }

  // ─── SUPPLIER PROFILE & HISTORY ───────────────────────────────

  @Get('suppliers/:id')
  @RequirePermissions('inventory:view')
  async getSupplierProfile(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.purchasesService.getSupplierProfile(tenantId, id);
  }
}
