import { PartialType } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSalesOrderDto } from './create-sales-order.dto';

/** Same rules as creation, every field optional (mapped type keeps the validators). */
export class UpdateSalesOrderDto extends PartialType(CreateSalesOrderDto) {}

export class UpdateReadyQtyDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  readyQty: number;
}
