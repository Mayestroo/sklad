import {
  ArrayMinSize,
  IsArray,
  Matches,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsValidCurrency } from '../../../common/validators/currency.validator';

export class JournalLineDto {
  @IsString()
  @IsNotEmpty()
  debitAccountId: string;

  @IsString()
  @IsNotEmpty()
  creditAccountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  /** Document currency of the line; omitted for a line measured in UZS. */
  @IsOptional()
  @IsValidCurrency()
  currency?: string;

  /** Amount in `currency`; required when the currency is not UZS. */
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amountOrig?: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateJournalEntryDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  sourceDocType?: string;

  @IsString()
  @IsOptional()
  sourceDocId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}

/**
 * A journal entry typed in by an accountant (TZ 10.2): a date, a description
 * and at least one line, each with a debit and a different credit account.
 * Each line carries both sides, so debit always equals credit.
 */
export class ManualJournalEntryDto {
  @Matches(/^d{4}-d{2}-d{2}$/)
  date: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}
