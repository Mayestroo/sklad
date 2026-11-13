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
import { FixedAssetsService } from './fixed-assets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import {
  CreateFixedAssetDto,
  UpdateFixedAssetDto,
} from './dto/fixed-asset.dto';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/fixed-assets')
export class FixedAssetsController {
  constructor(private readonly fixedAssetsService: FixedAssetsService) {}

  @Get()
  @RequirePermissions('accounting:view')
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query('search') search?: string,
  ) {
    return this.fixedAssetsService.findAll(tenantId, search);
  }

  @Get(':id')
  @RequirePermissions('accounting:view')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.fixedAssetsService.findOne(tenantId, id);
  }

  @Post()
  @RequirePermissions('accounting:create')
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateFixedAssetDto,
  ) {
    return this.fixedAssetsService.create(tenantId, dto);
  }

  @Put(':id')
  @RequirePermissions('accounting:edit')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFixedAssetDto,
  ) {
    return this.fixedAssetsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('accounting:delete')
  async delete(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.fixedAssetsService.delete(tenantId, id);
  }
}
