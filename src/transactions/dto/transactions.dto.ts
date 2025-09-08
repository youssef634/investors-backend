import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsNotEmpty()
  investorId: number;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNumber()
  amount: number;
}


export class GetTransactionsDto {
  @IsOptional()
  type?: TransactionType;

  @IsOptional()
  investorId?: number;

  @IsOptional()
  minAmount?: number;

  @IsOptional()
  maxAmount?: number;

  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;

  @IsOptional()
  limit?: number;

  @IsOptional()
  year?: number;

  @IsOptional()
  periodName?: string;
}