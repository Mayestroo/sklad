import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateCounterpartyDto {
  @IsEnum(['CUSTOMER', 'SUPPLIER', 'BOTH'])
  @IsOptional()
  type?: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  inn?: string;

  @IsString()
  @IsOptional()
  mfo?: string;

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
  folderId?: string | null;

  @IsString()
  @IsOptional()
  priceListId?: string | null;

  @IsOptional()
  discountPercent?: number;
}
