import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InventoryDocItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateInventoryDocDto {
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsEnum(['INBOUND', 'OUTBOUND', 'STOCKTAKING'])
  docType: 'INBOUND' | 'OUTBOUND' | 'STOCKTAKING';

  @IsString()
  @IsOptional()
  comment?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryDocItemDto)
  items: InventoryDocItemDto[];
}
