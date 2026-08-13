import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CrmService } from './crm.service';
import { CreateDealDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { DealStageSlug } from '@prisma/client';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/sales/deals')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post()
  @RequirePermissions('sales:create')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateDealDto) {
    return this.crmService.createDeal(tenantId, dto);
  }

  @Get('kanban')
  @RequirePermissions('sales:view')
  getKanban(@CurrentTenant() tenantId: string) {
    return this.crmService.findKanbanBoard(tenantId);
  }

  @Patch(':id/stage')
  @RequirePermissions('sales:edit')
  updateStage(
    @CurrentTenant() tenantId: string,
    @Param('id') dealId: string,
    @Body('stage') stage: DealStageSlug,
  ) {
    return this.crmService.updateDealStage(tenantId, dealId, stage);
  }
}
