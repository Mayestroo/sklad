import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductionDocumentDto {
  @IsUUID()
  recipeId: string;

  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  plannedQuantity: number;

  @IsUUID()
  warehouseId: string;

  @IsOptional()
  @IsUUID()
  responsibleId?: string;

  @IsOptional()
  @IsDateString()
  docDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
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
  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  producedQuantity: number;
}

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
}
