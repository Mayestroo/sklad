import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCounterpartyDto {
  @IsEnum(['CUSTOMER', 'SUPPLIER', 'BOTH'])
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  inn?: string; // STIR (9 digits in UZ)

  @IsString()
  @IsOptional()
  mfo?: string; // MFO (5 digits)

  @IsString()
  @IsOptional()
  bankAccount?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  folderId?: string;

  @IsString()
  @IsOptional()
  priceListId?: string;

  @IsOptional()
  discountPercent?: number;
}
