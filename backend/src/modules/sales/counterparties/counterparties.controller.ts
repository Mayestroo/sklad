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
import { CounterpartiesService } from './counterparties.service';
import {
  CreateCounterpartyDto,
  UpdateCounterpartyDto,
  CreateCounterpartyFolderDto,
  UpdateCounterpartyFolderDto,
} from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller(['api/sales/counterparties', 'api/v1/contacts'])
export class CounterpartiesController {
  constructor(private readonly counterpartiesService: CounterpartiesService) {}

  // ============================================
  // FOLDER ENDPOINTS
  // ============================================

  @Post('folders')
  @RequirePermissions('sales:create')
  createFolder(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateCounterpartyFolderDto,
  ) {
    return this.counterpartiesService.createFolder(tenantId, dto);
  }

  @Get('folders')
  @RequirePermissions('sales:view')
  findAllFolders(@CurrentTenant() tenantId: string) {
    return this.counterpartiesService.findAllFolders(tenantId);
  }

  @Patch('folders/:id')
  @RequirePermissions('sales:edit')
  updateFolder(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCounterpartyFolderDto,
  ) {
    return this.counterpartiesService.updateFolder(tenantId, id, dto);
  }

  @Delete('folders/:id')
  @RequirePermissions('sales:delete')
  deleteFolder(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.counterpartiesService.deleteFolder(tenantId, id);
  }

  // ============================================
  // COUNTERPARTY ENDPOINTS
  // ============================================

  @Get('summary')
  @RequirePermissions('sales:view')
  getSummary(@CurrentTenant() tenantId: string) {
    return this.counterpartiesService.getSummary(tenantId);
  }

  @Post()
  @RequirePermissions('sales:create')
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateCounterpartyDto,
  ) {
    return this.counterpartiesService.create(tenantId, dto);
  }

  @Get()
  @RequirePermissions('sales:view')
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('type') type?: string,
    @Query('folderId') folderId?: string,
    @Query('search') search?: string,
    @Query('hasDebt') hasDebt?: string,
    @Query('balanceFilter')
    balanceFilter?: 'all' | 'receivables' | 'payables' | 'settled',
  ) {
    const isHasDebt = hasDebt === 'true';
    return this.counterpartiesService.findAll(
      tenantId,
      type,
      folderId,
      search,
      isHasDebt,
      balanceFilter,
    );
  }

  @Get(':id')
  @RequirePermissions('sales:view')
  findById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.counterpartiesService.findById(tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('sales:edit')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCounterpartyDto,
  ) {
    return this.counterpartiesService.update(tenantId, id, dto);
  }
}
