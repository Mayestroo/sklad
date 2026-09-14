import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CancelTransactionDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsString()
  reason?: string;
}
