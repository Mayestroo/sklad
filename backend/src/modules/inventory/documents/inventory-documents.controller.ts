import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryDocumentsService } from './inventory-documents.service';
import { CreateInventoryDocDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/inventory/documents')
export class InventoryDocumentsController {
  constructor(private readonly docsService: InventoryDocumentsService) {}

  @Post()
  @RequirePermissions('inventory:create')
  createAndPost(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInventoryDocDto,
  ) {
    return this.docsService.createAndPostDocument(tenantId, dto, userId);
  }

  @Get()
  @RequirePermissions('inventory:view')
  findAll(@CurrentTenant() tenantId: string, @Query('type') docType?: string) {
    return this.docsService.findAllByTenant(tenantId, docType);
  }

  @Get(':id')
  @RequirePermissions('inventory:view')
  findById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.docsService.findById(tenantId, id);
  }
}
