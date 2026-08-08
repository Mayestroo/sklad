import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsObject()
  @IsNotEmpty()
  name: {
    uz: string;
    ru: string;
  };

  @IsEnum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
}
