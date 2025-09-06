import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal', // from principal
  PROFIT = 'profit',         // when approving a year distribution
}

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
  startDate?: string; // ISO string

  @IsOptional()
  endDate?: string; // ISO string

  @IsOptional()
  limit?: number;
}