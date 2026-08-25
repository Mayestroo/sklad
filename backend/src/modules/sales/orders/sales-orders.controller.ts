import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from '../dto/create-sales-order.dto';
import { FilterSalesOrdersDto } from '../dto/filter-sales-orders.dto';
import { DispatchSalesOrderDto } from '../dto/dispatch-sales-order.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

class TransitionDto {
  @IsEnum(['SUBMIT', 'APPROVE', 'REJECT', 'SEND_TO_PRODUCTION', 'CANCEL'])
  action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'SEND_TO_PRODUCTION' | 'CANCEL';

  @IsOptional()
  @IsString()
  comment?: string;
}

class UpdateReadyQtyDto {
  readyQty: number;
}

class DispatchDto {
  warehouseId: string;
}

@ApiTags('Sales Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/sales/orders')
export class SalesOrdersController {
  constructor(private readonly service: SalesOrdersService) {}

  // ─── STATS / DASHBOARD ─────────────────────────────────────────

  @Get('stats')
  @RequirePermissions('sales:view')
  getDashboardStats(@CurrentTenant() tenantId: string) {
    return this.service.getDashboardStats(tenantId);
  }

  // ─── PRODUCTION ORDERS LIST ────────────────────────────────────

  @Get('production')
  @RequirePermissions('sales:view')
  findProductionOrders(
    @CurrentTenant() tenantId: string,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findProductionOrders(tenantId, { salesOrderId, status });
  }

  // ─── LIST & CREATE ─────────────────────────────────────────────

  @Get('by-counterparty/:counterpartyId')
  @RequirePermissions('sales:view')
  async findByCounterparty(
    @CurrentTenant() tenantId: string,
    @Param('counterpartyId') counterpartyId: string,
  ) {
    const result = await this.service.findAll(tenantId, { counterpartyId });
    const orderList = result.data || [];
    const totalOrders = result.total ?? orderList.length;
    const totalAmount = orderList.reduce(
      (sum: number, o: any) => sum + Number(o.totalAmount || 0),
      0,
    );
    return {
      orders: orderList,
      summary: {
        totalOrders,
        totalAmount,
      },
    };
  }

  @Get()
  @RequirePermissions('sales:view')
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterSalesOrdersDto,
  ) {
    return this.service.findAll(tenantId, filters);
  }

  @Post()
  @RequirePermissions('sales:create')
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: CreateSalesOrderDto,
  ) {
    return this.service.create(tenantId, userId, roles || [], dto);
  }

  // ─── SINGLE ORDER ─────────────────────────────────────────────

  @Get(':id')
  @RequirePermissions('sales:view')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('sales:create')
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateSalesOrderDto>,
  ) {
    return this.service.update(tenantId, userId, id, dto);
  }

  // ─── STATUS TRANSITIONS ────────────────────────────────────────

  @Post(':id/transition')
  @RequirePermissions('sales:create')
  transition(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: string[],
    @Param('id') id: string,
    @Body() dto: TransitionDto,
  ) {
    return this.service.transition(tenantId, userId, id, dto.action, roles || [], dto.comment);
  }

  @Post(':id/complete')
  @RequirePermissions('sales:post')
  completeOrder(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: string[],
    @Param('id') id: string,
  ) {
    return this.service.completeOrder(tenantId, userId, id, roles || []);
  }

  // ─── DISPATCH ─────────────────────────────────────────────────

  @Post(':id/dispatch')
  @RequirePermissions('inventory:create')
  dispatch(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: DispatchSalesOrderDto,
  ) {
    return this.service.dispatch(tenantId, userId, id, dto);
  }

  // ─── COUNTERPARTY PROFILE ──────────────────────────────────────

  @Get('by-counterparty/:counterpartyId')
  @RequirePermissions('sales:view')
  getCounterpartyOrders(
    @CurrentTenant() tenantId: string,
    @Param('counterpartyId') counterpartyId: string,
  ) {
    return this.service.getCounterpartyOrders(tenantId, counterpartyId);
  }

  // ─── PRODUCTION ORDER ACTIONS ──────────────────────────────────

  @Post('production/:productionOrderId/start')
  @RequirePermissions('sales:create')
  startProductionOrder(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('productionOrderId') productionOrderId: string,
  ) {
    return this.service.startProductionOrder(tenantId, userId, productionOrderId);
  }

  @Patch('production/:productionOrderId/ready-qty')
  @RequirePermissions('sales:create')
  updateReadyQty(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('productionOrderId') productionOrderId: string,
    @Body() dto: UpdateReadyQtyDto,
  ) {
    return this.service.updateProductionReadyQty(
      tenantId,
      userId,
      productionOrderId,
      dto.readyQty,
    );
  }
}
