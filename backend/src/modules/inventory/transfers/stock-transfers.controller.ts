import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { CreateStockTransferDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/inventory/transfers')
export class StockTransfersController {
  constructor(private readonly transfersService: StockTransfersService) {}

  @Get()
  @RequirePermissions('inventory:view')
  findAll(@CurrentTenant() tenantId: string) {
    return this.transfersService.findAllByTenant(tenantId);
  }

  @Post()
  @RequirePermissions('inventory:create')
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateStockTransferDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.transfersService.createTransfer(tenantId, dto, userId);
  }

  @Post(':id/ship')
  @RequirePermissions('inventory:edit')
  ship(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.transfersService.shipTransfer(tenantId, id, userId);
  }

  @Post(':id/receive')
  @RequirePermissions('inventory:edit')
  receive(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.transfersService.receiveTransfer(tenantId, id, userId);
  }
}
