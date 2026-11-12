import { IsBoolean, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { IsValidCurrency } from '../../../common/validators/currency.validator';

export class CreatePriceListDto {
  @IsObject()
  @IsNotEmpty()
  name: { uz: string; ru: string };

  @IsValidCurrency()
  currency: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
