import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** A bilingual name: both languages are required (no silent fallback). */
export class BilingualNameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  uz: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  ru: string;
}

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ValidateNested()
  @Type(() => BilingualNameDto)
  name: BilingualNameDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BilingualNameDto)
  alias?: BilingualNameDto;

  @IsEnum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
}

export class UpdateAccountDto {
  /** The plain-language name; null goes back to the default alias. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => BilingualNameDto)
  alias?: BilingualNameDto | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
