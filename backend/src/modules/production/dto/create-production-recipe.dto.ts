import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
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

export class ProductionRecipeMaterialDto {
  @IsUUID()
  productId: string;

  /** Quantity in `unit` (the material's base unit when `unit` is empty). */
  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  quantity: number;

  /** Entry unit: the base unit code, a sub-unit (g, ml, cm, mm) or a product unit name. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  /** Loss (otxod) percent of this line: 0 … 99.99 (TZ 4.2). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99.99)
  @Type(() => Number)
  lossPercent?: number;
}

export class CreateProductionRecipeDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  outputQuantity: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ProductionRecipeMaterialDto)
  materials: ProductionRecipeMaterialDto[];
}

export class SetRecipeActiveDto {
  @IsBoolean()
  isActive: boolean;
}

export class FilterProductionRecipesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'inactive', 'archived'])
  status?: 'all' | 'active' | 'inactive' | 'archived';

  /** Only recipes whose cost is not calculated (a material has no price). */
  @IsOptional()
  @IsIn(['true', 'false'])
  uncosted?: 'true' | 'false';

  @IsOptional()
  @IsUUID()
  productId?: string;
}
