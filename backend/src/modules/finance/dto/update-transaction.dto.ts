import { IsOptional, IsString } from 'class-validator';

/** Only descriptive fields of a posted transaction can change; amounts are reversed via storno. */
export class UpdateTransactionDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  transactionTypeId?: string;
}
