import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OpeningBalanceLineDto } from './opening-balance-line.dto';

export class CreateOpeningBalanceDto {
  @IsNotEmpty()
  @IsDateString()
  openingDate: string;

  @IsOptional()
  @IsString()
  docNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceLineDto)
  lines?: OpeningBalanceLineDto[];
}
