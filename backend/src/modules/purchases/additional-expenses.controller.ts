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
import { AdditionalExpensesService } from './additional-expenses.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateAdditionalExpenseDto,
  UpdateAdditionalExpenseDto,
} from './dto/create-additional-expense.dto';
import { FilterAdditionalExpensesDto } from './dto/filter-additional-expenses.dto';
import { CalculateAllocationDto } from './dto/calculate-allocation.dto';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/purchases/additional-expenses')
export class AdditionalExpensesController {
  constructor(
    private readonly additionalExpensesService: AdditionalExpensesService,
  ) {}

  @Post('preview-allocation')
  @RequirePermissions('inventory:view')
  async previewAllocation(
    @CurrentTenant() tenantId: string,
    @Body() dto: CalculateAllocationDto,
  ) {
    return this.additionalExpensesService.calculateAllocationPreview(
      tenantId,
      dto,
    );
  }

  @Get()
  @RequirePermissions('inventory:view')
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterAdditionalExpensesDto,
  ) {
    return this.additionalExpensesService.findAll(tenantId, filters);
  }

  @Get(':id')
  @RequirePermissions('inventory:view')
  async findById(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.additionalExpensesService.findById(tenantId, id);
  }

  @Post()
  @RequirePermissions('inventory:create')
  async createDraft(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAdditionalExpenseDto,
  ) {
    return this.additionalExpensesService.createDraft(tenantId, userId, dto);
  }

  @Put(':id')
  @RequirePermissions('inventory:edit')
  async updateDraft(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAdditionalExpenseDto,
  ) {
    return this.additionalExpensesService.updateDraft(
      tenantId,
      userId,
      id,
      dto,
    );
  }

  @Post(':id/post')
  @RequirePermissions('inventory:edit')
  async postExpense(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.additionalExpensesService.postExpense(tenantId, userId, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory:edit')
  async cancelExpense(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.additionalExpensesService.cancelExpense(tenantId, userId, id);
  }

  @Delete(':id')
  @RequirePermissions('inventory:delete')
  async deleteDraft(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.additionalExpensesService.deleteDraft(tenantId, id);
  }
}
