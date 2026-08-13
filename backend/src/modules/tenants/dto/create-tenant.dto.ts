import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TranslatableFieldDto {
  @IsString()
  @IsNotEmpty()
  uz: string;

  @IsString()
  @IsNotEmpty()
  ru: string;
}

export class CreateTenantDto {
  @IsObject()
  @ValidateNested()
  name: TranslatableFieldDto;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsEnum(['uz', 'ru'])
  @IsOptional()
  defaultLanguage?: 'uz' | 'ru';
}
