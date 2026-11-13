import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TranslatableTextDto } from '../../inventory/dto/create-product.dto';
import { IsValidCurrency } from '../../../common/validators/currency.validator';

export class UpdatePriceListDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  name?: TranslatableTextDto;

  @IsOptional()
  @IsValidCurrency()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductPriceInputDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;
}

/** Either one { productId, price } or { items: [...] } for a bulk update. */
export class SetPriceListItemsDto {
  @ValidateIf((o: SetPriceListItemsDto) => o.items === undefined)
  @IsString()
  @IsNotEmpty()
  productId?: string;

  @ValidateIf((o: SetPriceListItemsDto) => o.items === undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPriceInputDto)
  items?: ProductPriceInputDto[];
}

export class UpsertProductPriceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;
}
