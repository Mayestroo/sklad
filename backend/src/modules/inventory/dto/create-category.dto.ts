import { IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TranslatableCategoryNameDto {
  @IsString()
  @IsNotEmpty()
  uz: string;

  @IsString()
  @IsNotEmpty()
  ru: string;
}

export class CreateCategoryDto {
  @IsObject()
  @ValidateNested()
  @Type(() => TranslatableCategoryNameDto)
  name: TranslatableCategoryNameDto;

  @IsString()
  @IsOptional()
  parentId?: string;
}
