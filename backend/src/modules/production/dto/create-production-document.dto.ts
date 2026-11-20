import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const PRODUCTION_COST_TYPES = [
  'SALARY',
  'ENERGY',
  'DEPRECIATION',
  'OTHER',
] as const;
export type ProductionCostTypeValue = (typeof PRODUCTION_COST_TYPES)[number];

/** A manual extra cost line (TZ 5.1): type and amount in UZS. */
export class ProductionExtraCostDto {
  @IsIn(PRODUCTION_COST_TYPES)
  costType: ProductionCostTypeValue;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class CreateProductionDocumentDto {
  @IsUUID()
  recipeId: string;

  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  plannedQuantity: number;

  /** Raw-material warehouse (materials leave it). */
  @IsUUID()
  warehouseId: string;

  /** Finished-goods warehouse; empty = the raw-material warehouse. */
  @IsOptional()
  @IsUUID()
  outputWarehouseId?: string;

  @IsOptional()
  @IsUUID()
  responsibleId?: string;

  @IsOptional()
  @IsDateString()
  docDate?: string;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionExtraCostDto)
  extraCosts?: ProductionExtraCostDto[];
}

/** Editing a document: every field of a draft; fewer once it is in progress. */
export class UpdateProductionDocumentDto {
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  plannedQuantity?: number;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  /** null clears it (output goes to the raw-material warehouse). */
  @IsOptional()
  @IsUUID()
  outputWarehouseId?: string | null;

  @IsOptional()
  @IsUUID()
  responsibleId?: string | null;

  @IsOptional()
  @IsDateString()
  docDate?: string;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionExtraCostDto)
  extraCosts?: ProductionExtraCostDto[];
}

export class ActualProductionMaterialDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualQuantity: number;
}

export class UpdateActualMaterialsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ActualProductionMaterialDto)
  materials: ActualProductionMaterialDto[];
}

export class CompleteProductionDocumentDto {
  /** Actually produced quantity (TZ 5.1 "Haqiqiy chiqqan miqdor"). */
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  producedQuantity: number;

  /** Actual consumption; lines left out keep what was issued at start. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActualProductionMaterialDto)
  materials?: ActualProductionMaterialDto[];

  /** Replaces the extra cost lines when given. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionExtraCostDto)
  extraCosts?: ProductionExtraCostDto[];
}

export class CancelProductionDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export const PRODUCTION_SORT_FIELDS = [
  'docNumber',
  'docDate',
  'product',
  'plannedQuantity',
  'status',
  'warehouse',
  'responsible',
  'totalCost',
] as const;

export class FilterProductionDocumentsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  responsibleId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsIn(PRODUCTION_SORT_FIELDS)
  sortBy?: (typeof PRODUCTION_SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
