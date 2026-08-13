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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateIncomeDto } from './dto/create-income.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { FilterTransactionsDto } from './dto/filter-transactions.dto';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ─── Accounts ────────────────────────────────────────────────

  @Get('accounts')
  @RequirePermissions('finance:view')
  async getAccounts(@CurrentTenant() tenantId: string) {
    return this.financeService.ensureDefaultAccounts(tenantId);
  }

  // ─── Summary ─────────────────────────────────────────────────

  @Get('summary')
  @RequirePermissions('finance:view')
  async getSummary(
    @CurrentTenant() tenantId: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('currency') currency?: string,
  ) {
    return this.financeService.getSummary(tenantId, {
      date_from,
      date_to,
      currency,
    });
  }

  // ─── Journal ─────────────────────────────────────────────────

  @Get('transactions')
  @RequirePermissions('finance:view')
  async getTransactions(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterTransactionsDto,
  ) {
    return this.financeService.getTransactions(tenantId, filters);
  }

  // ─── Transaction Types ────────────────────────────────────────

  @Get('transaction-types')
  @RequirePermissions('finance:view')
  async getTransactionTypes(@CurrentTenant() tenantId: string) {
    return this.financeService.getTransactionTypes(tenantId);
  }

  // ─── Income ──────────────────────────────────────────────────

  @Post('income')
  @RequirePermissions('finance:create')
  async createIncome(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateIncomeDto,
  ) {
    return this.financeService.createIncome(tenantId, dto, user?.id);
  }

  // ─── Expense ─────────────────────────────────────────────────

  @Post('expense')
  @RequirePermissions('finance:create')
  async createExpense(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.financeService.createExpense(tenantId, dto, user?.id);
  }

  // ─── Transfer ─────────────────────────────────────────────────

  @Post('transfer')
  @RequirePermissions('finance:create')
  async createTransfer(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateTransferDto,
  ) {
    return this.financeService.createTransfer(tenantId, dto, user?.id);
  }

  // ─── Edit ─────────────────────────────────────────────────────

  @Put('transactions/:id')
  @RequirePermissions('finance:edit')
  async updateTransaction(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: { comment?: string; transactionTypeId?: string },
  ) {
    return this.financeService.updateTransaction(tenantId, id, body);
  }

  // ─── Delete (restricted) ─────────────────────────────────────

  @Delete('transactions/:id')
  @RequirePermissions('finance:delete')
  @HttpCode(HttpStatus.OK)
  async deleteTransaction(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.financeService.deleteTransaction(tenantId, id);
  }
}
