import { IsEmail, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TranslatableNameDto {
  @IsString()
  @IsNotEmpty()
  uz: string;

  @IsString()
  @IsNotEmpty()
  ru: string;
}

export class RegisterCompanyDto {
  // Company Info
  @IsObject()
  @ValidateNested()
  @Type(() => TranslatableNameDto)
  companyName: TranslatableNameDto;

  @IsString()
  @IsNotEmpty()
  companySlug: string;

  @IsEnum(['uz', 'ru'])
  @IsOptional()
  defaultLanguage?: 'uz' | 'ru';

  // Admin User Info
  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(6)
  adminPassword: string;

  @IsString()
  @IsNotEmpty()
  adminFirstName: string;

  @IsString()
  @IsNotEmpty()
  adminLastName: string;

  @IsEnum(['uz', 'ru'])
  @IsOptional()
  adminPreferredLanguage?: 'uz' | 'ru';
}
