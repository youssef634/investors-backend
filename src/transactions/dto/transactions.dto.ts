import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',           // from principal
  WITHDRAWAL_PROFIT = 'withdraw_profit', // from profit only
  PROFIT = 'profit',                   // when approving a year distribution
  ROLLOVER_PROFIT = 'rollover_profit', // moves profit into principal
}


export class CreateTransactionDto {
  @IsNotEmpty()
  userId: number;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNumber()
  amount: number;
}

export class GetTransactionsDto {
  @IsOptional()
  type?: TransactionType;

  @IsOptional()
  userId: number;

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
