import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateTransactionDto, GetTransactionsDto} from './dto/transactions.dto';

import { Role, TransactionType } from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) { }

  private async checkAdmin(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can perform this action');
    }
  }

  async addTransaction(currentUserId: number, dto: CreateTransactionDto) {
    await this.checkAdmin(currentUserId);

    const investor = await this.prisma.investors.findUnique({ where: { id: dto.investorId } });
    if (!investor) throw new BadRequestException('Investor does not exist');

    let settings = await this.prisma.settings.findFirst();
    if (!settings) throw new BadRequestException('Settings not found');

    const amountInIQD = settings.defaultCurrency === 'USD'
      ? dto.amount * settings.USDtoIQD
      : dto.amount;

    if (![TransactionType.DEPOSIT, TransactionType.WITHDRAWAL, TransactionType.ROLLOVER].includes(dto.type)) {
      throw new BadRequestException('Only deposit and withdrawal are allowed');
    }

    return this.prisma.$transaction(async (tx) => {
      let updatedAmount = investor.amount;
      let updatedRollover = investor.rollover_amount;
      let withdrawSource: 'AMOUNT' | 'ROLLOVER' | null = null;

      if (dto.type === TransactionType.DEPOSIT) {
        // ✅ Just add deposit
        updatedAmount += amountInIQD;

      } else if (dto.type === TransactionType.WITHDRAWAL) {
        if (amountInIQD > investor.amount) {
          throw new BadRequestException('Withdrawal exceeds total balance');
        }

        // ✅ Case 1: withdraw fully from rollover
        if (amountInIQD <= investor.rollover_amount) {
          updatedRollover -= amountInIQD;
          updatedAmount -= amountInIQD;
          withdrawSource = 'ROLLOVER';

          // ✅ Case 2: withdraw more than rollover → take rollover first then from amount
        } else {
          const rolloverDeduct = investor.rollover_amount;
          const amountDeduct = amountInIQD - rolloverDeduct;

          updatedRollover = 0;
          updatedAmount -= amountInIQD; // remove total from main amount
          withdrawSource = 'AMOUNT';
        }
      }

      // ✅ Update investor balances
      await tx.investors.update({
        where: { id: dto.investorId },
        data: {
          amount: updatedAmount,
          rollover_amount: updatedRollover,
        },
      });

      // ✅ Save transaction
      return tx.transaction.create({
        data: {
          investorId: dto.investorId,
          type: dto.type,
          amount: dto.amount,
          currency: settings.defaultCurrency,
          withdrawSource,
          date: new Date(),
        },
      });
    });
  }

  async deleteTransaction(currentUserId: number, id: number) {
    await this.checkAdmin(currentUserId);

    const transaction = await this.prisma.transaction.findUnique({ where: { id } });
    if (!transaction) throw new NotFoundException('Transaction not found');

    return this.prisma.transaction.delete({ where: { id } });
  }

  async getTransactions(
    currentUserId: number,
    page: number = 1,
    query?: GetTransactionsDto,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUserId } });
    if (!user) throw new ForbiddenException('User not found');

    const limit = query?.limit && query.limit > 0 ? Number(query.limit) : 10;
    const filters: any = {};

    if (query?.type) filters.type = query.type;
    if (query?.minAmount || query?.maxAmount)
      filters.amount = {
        gte: query?.minAmount ?? undefined,
        lte: query?.maxAmount ?? undefined,
      };
    if (query?.startDate || query?.endDate)
      filters.date = {
        gte: query?.startDate ? new Date(query.startDate) : undefined,
        lte: query?.endDate ? new Date(query.endDate) : undefined,
      };
    if (query?.investorId) {
      filters.investorId = Number(query.investorId);
    }

    // ✅ Join FinancialYear for filtering
    const yearFilter: any = {};
    if (query?.year) yearFilter.year = query.year;
    if (query?.periodName) yearFilter.periodName = query.periodName;

    const totalTransactions = await this.prisma.transaction.count({
      where: {
        ...filters,
        financialYear: Object.keys(yearFilter).length ? yearFilter : undefined,
      },
    });
    const totalPages = Math.ceil(totalTransactions / limit);
    if (page > totalPages && totalTransactions > 0) throw new NotFoundException('Page not found');

    const skip = (page - 1) * limit;

    const transactions = await this.prisma.transaction.findMany({
      where: {
        ...filters,
        financialYear: Object.keys(yearFilter).length ? yearFilter : undefined,
      },
      skip,
      take: Number(limit),
      orderBy: { date: 'desc' },
      include: {
        investors: { select: { fullName: true, phone: true } },
        financialYear: { select: { year: true, periodName: true } }, // 👈 include
      },
    });

    // ✅ Timezone formatting
    let settings = await this.prisma.settings.findFirst();
    if (!settings) throw new NotFoundException('Admin settings not found');
    const timezone = settings?.timezone || 'UTC';

    const formattedTransactions = transactions.map((tx) => ({
      ...tx,
      date: DateTime.fromJSDate(tx.date, { zone: 'utc' })
        .setZone(timezone)
        .toFormat('MMM dd, yyyy, hh:mm a'),
    }));

    return {
      totalTransactions,
      totalPages,
      currentPage: page,
      transactions: formattedTransactions,
    };
  }
}