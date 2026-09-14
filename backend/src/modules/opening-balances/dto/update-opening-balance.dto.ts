import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OpeningBalanceLineDto } from './opening-balance-line.dto';

export class UpdateOpeningBalanceLinesDto {
  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceLineDto)
  lines: OpeningBalanceLineDto[];
}
