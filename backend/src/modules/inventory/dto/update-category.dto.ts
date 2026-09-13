import {
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TranslatableCategoryNameDto } from './create-category.dto';

export class UpdateCategoryDto {
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => TranslatableCategoryNameDto)
  name?: TranslatableCategoryNameDto;

  @IsString()
  @IsOptional()
  parentId?: string | null;
}
