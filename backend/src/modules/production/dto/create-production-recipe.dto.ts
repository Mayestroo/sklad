import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductionRecipeMaterialDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  quantity: number;
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

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ProductionRecipeMaterialDto)
  materials: ProductionRecipeMaterialDto[];
}
