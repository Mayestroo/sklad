import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import {
  CreateProductionDocumentDto,
  CompleteProductionDocumentDto,
  FilterProductionDocumentsDto,
  UpdateActualMaterialsDto,
} from './dto/create-production-document.dto';
import { CreateProductionRecipeDto } from './dto/create-production-recipe.dto';
import { ProductionService } from './production.service';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('recipes')
  @RequirePermissions('inventory:view')
  findRecipes(
    @CurrentTenant() tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.productionService.findRecipes(
      tenantId,
      includeInactive === 'true',
    );
  }

  @Post('recipes')
  @RequirePermissions('inventory:create')
  createRecipe(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProductionRecipeDto,
  ) {
    return this.productionService.createRecipe(tenantId, userId, dto);
  }

  @Put('recipes/:id')
  @RequirePermissions('inventory:edit')
  updateRecipe(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateProductionRecipeDto,
  ) {
    return this.productionService.updateRecipe(tenantId, userId, id, dto);
  }

  @Get('recipes/:id/preview')
  @RequirePermissions('inventory:view')
  preview(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query('quantity') quantity: string,
    @Query('warehouseId') warehouseId: string,
  ) {
    const outputQuantity = Number(quantity);
    if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) {
      throw new BadRequestException('quantity must be greater than zero');
    }
    return this.productionService.preview(
      tenantId,
      id,
      outputQuantity,
      warehouseId,
    );
  }

  @Get('documents')
  @RequirePermissions('inventory:view')
  findDocuments(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterProductionDocumentsDto,
  ) {
    return this.productionService.findDocuments(tenantId, filters);
  }

  @Post('documents')
  @RequirePermissions('inventory:create')
  createDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProductionDocumentDto,
  ) {
    return this.productionService.createDocument(tenantId, userId, dto);
  }

  @Get('documents/:id')
  @RequirePermissions('inventory:view')
  findDocument(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productionService.findDocument(tenantId, id);
  }

  @Post('documents/:id/plan')
  @RequirePermissions('inventory:create')
  plan(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.productionService.plan(tenantId, userId, id);
  }

  @Post('documents/:id/start')
  @RequirePermissions('inventory:create')
  start(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.productionService.start(tenantId, userId, id);
  }

  @Put('documents/:id/materials/actual')
  @RequirePermissions('inventory:edit')
  updateActualMaterials(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateActualMaterialsDto,
  ) {
    return this.productionService.updateActualMaterials(
      tenantId,
      userId,
      id,
      dto,
    );
  }

  @Post('documents/:id/ready')
  @RequirePermissions('inventory:create')
  markReady(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.productionService.markReady(tenantId, userId, id);
  }

  @Post('documents/:id/complete')
  @RequirePermissions('inventory:create')
  complete(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CompleteProductionDocumentDto,
  ) {
    return this.productionService.complete(tenantId, userId, id, dto);
  }

  @Post('documents/:id/cancel')
  @RequirePermissions('inventory:edit')
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.productionService.cancel(tenantId, userId, id);
  }
}
