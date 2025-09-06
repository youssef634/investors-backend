import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  WITHDRAW_PROFIT = 'withdraw_profit',
  PROFIT = 'profit',    
  ROLLOVER = 'rollover', 
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