import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** An inclusive period of whole days (YYYY-MM-DD). */
export class PeriodQueryDto {
  @IsOptional()
  @Matches(DAY)
  from?: string;

  @IsOptional()
  @Matches(DAY)
  to?: string;
}

export class JournalQueryDto extends PeriodQueryDto {
  /** A document group (sales, purchases, payments, production, opening, other) or one source type. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceDocId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  accountCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

/** Which accounts feed each balance card of the simple mode (TZ 5.2). */
export class CardAccountsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  money?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  receivables?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  payables?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inventory?: string[];
}
