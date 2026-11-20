import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CurrentLocale,
  type AppLocale,
} from '../../common/decorators/current-locale.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import {
  CancelProductionDocumentDto,
  CreateProductionDocumentDto,
  CompleteProductionDocumentDto,
  FilterProductionDocumentsDto,
  UpdateActualMaterialsDto,
  UpdateProductionDocumentDto,
} from './dto/create-production-document.dto';
import {
  CreateProductionRecipeDto,
  FilterProductionRecipesDto,
  SetRecipeActiveDto,
} from './dto/create-production-recipe.dto';
import { ProductionService } from './production.service';

/**
 * Production (TZ "Ishlab chiqarish"). Rights are separate (TZ 9.3):
 * view / create / edit (recipes, drafts, start) / delete / complete / cancel.
 */
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('materials')
  @RequirePermissions('production:view')
  findMaterials(@CurrentTenant() tenantId: string) {
    return this.productionService.findMaterials(tenantId);
  }

  @Get('finished-products')
  @RequirePermissions('production:view')
  findFinishedProducts(@CurrentTenant() tenantId: string) {
    return this.productionService.findFinishedProducts(tenantId);
  }

  @Get('recipes')
  @RequirePermissions('production:view')
  findRecipes(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterProductionRecipesDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.findRecipes(tenantId, filters, locale);
  }

  @Get('recipes/:id')
  @RequirePermissions('production:view')
  findRecipe(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.findRecipe(tenantId, id, locale);
  }

  @Post('recipes')
  @RequirePermissions('production:create')
  createRecipe(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProductionRecipeDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.createRecipe(tenantId, userId, dto, locale);
  }

  @Put('recipes/:id')
  @RequirePermissions('production:edit')
  updateRecipe(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateProductionRecipeDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.updateRecipe(
      tenantId,
      userId,
      id,
      dto,
      locale,
    );
  }

  @Post('recipes/:id/copy')
  @RequirePermissions('production:create')
  copyRecipe(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.copyRecipe(tenantId, userId, id, locale);
  }

  @Post('recipes/:id/active')
  @RequirePermissions('production:edit')
  setRecipeActive(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SetRecipeActiveDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.setRecipeActive(
      tenantId,
      userId,
      id,
      dto.isActive,
      locale,
    );
  }

  @Post('recipes/:id/archive')
  @RequirePermissions('production:delete')
  archiveRecipe(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.archiveRecipe(tenantId, userId, id, locale);
  }

  @Delete('recipes/:id')
  @RequirePermissions('production:delete')
  deleteRecipe(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.deleteRecipe(tenantId, userId, id, locale);
  }

  @Get('recipes/:id/preview')
  @RequirePermissions('production:view')
  preview(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query('quantity') quantity: string,
    @Query('warehouseId') warehouseId: string,
    @CurrentLocale() locale: AppLocale,
  ) {
    const outputQuantity = Number(quantity);
    if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) {
      throw new BadRequestException(
        locale === 'ru'
          ? 'Количество должно быть больше 0'
          : 'Miqdor 0 dan katta bo‘lishi kerak',
      );
    }
    if (!warehouseId) {
      throw new BadRequestException(
        locale === 'ru' ? 'Выберите склад' : 'Omborni tanlang',
      );
    }
    return this.productionService.preview(
      tenantId,
      id,
      outputQuantity,
      warehouseId,
      locale,
    );
  }

  @Get('documents')
  @RequirePermissions('production:view')
  findDocuments(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterProductionDocumentsDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.findDocuments(tenantId, filters, locale);
  }

  @Post('documents')
  @RequirePermissions('production:create')
  createDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProductionDocumentDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.createDocument(tenantId, userId, dto, locale);
  }

  @Get('documents/:id')
  @RequirePermissions('production:view')
  findDocument(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.findDocument(tenantId, id, locale);
  }

  @Put('documents/:id')
  @RequirePermissions('production:edit')
  updateDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductionDocumentDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.updateDocument(
      tenantId,
      userId,
      id,
      dto,
      locale,
    );
  }

  @Delete('documents/:id')
  @RequirePermissions('production:delete')
  deleteDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.deleteDocument(tenantId, userId, id, locale);
  }

  @Post('documents/:id/start')
  @RequirePermissions('production:edit')
  start(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.start(tenantId, userId, id, locale);
  }

  @Put('documents/:id/materials/actual')
  @RequirePermissions('production:edit')
  updateActualMaterials(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateActualMaterialsDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.updateActualMaterials(
      tenantId,
      userId,
      id,
      dto,
      locale,
    );
  }

  @Post('documents/:id/complete')
  @RequirePermissions('production:complete')
  complete(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CompleteProductionDocumentDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.complete(tenantId, userId, id, dto, locale);
  }

  @Post('documents/:id/cancel')
  @RequirePermissions('production:cancel')
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CancelProductionDocumentDto,
    @CurrentLocale() locale: AppLocale,
  ) {
    return this.productionService.cancel(tenantId, userId, id, dto, locale);
  }
}
