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
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateServiceActDto } from './dto/create-service-act.dto';
import { UpdateServiceActDto } from './dto/update-service-act.dto';
import { FilterServiceActsDto } from './dto/filter-service-acts.dto';
import { ServiceActType } from '@prisma/client';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @RequirePermissions('sales:create')
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateServiceActDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.servicesService.create(tenantId, dto, userId);
  }

  @Get()
  @RequirePermissions('sales:view')
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: FilterServiceActsDto,
  ) {
    return this.servicesService.findAll(tenantId, query);
  }

  @Get('unpaid')
  @RequirePermissions('sales:view')
  async getUnpaid(
    @CurrentTenant() tenantId: string,
    @Query('counterpartyId') counterpartyId: string,
    @Query('type') type?: ServiceActType,
  ) {
    return this.servicesService.getUnpaidActs(tenantId, counterpartyId, type);
  }

  @Get(':id')
  @RequirePermissions('sales:view')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.servicesService.findOne(tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('sales:edit')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceActDto,
  ) {
    return this.servicesService.update(tenantId, id, dto);
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sales:edit')
  async post(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.servicesService.post(tenantId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sales:edit')
  async cancel(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.servicesService.cancel(tenantId, id);
  }

  @Post(':id/unpost')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sales:edit')
  async unpost(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.servicesService.unpost(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('sales:delete')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.servicesService.remove(tenantId, id);
  }
}
