import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateTransactionDto, GetTransactionsDto } from './dto/transactions.dto';
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

    const settings = await this.prisma.settings.findFirst();
    if (!settings) throw new BadRequestException('Settings not found');

    // Normalize amount to USD
    let amountInUSD: number;
    if (dto.currency === 'USD') {
      amountInUSD = dto.amount;
    } else if (dto.currency === 'IQD') {
      amountInUSD = dto.amount / settings.USDtoIQD;
    } else {
      throw new BadRequestException('Unsupported currency');
    }

    if (![TransactionType.DEPOSIT, TransactionType.WITHDRAWAL, TransactionType.PROFIT].includes(dto.type)) {
      throw new BadRequestException('Invalid transaction type');
    }

    return this.prisma.$transaction(async (tx) => {
      let updatedAmount = investor.amount;
      let updatedTotalAmount = investor.total_amount;
      let updatedRollover = investor.rollover_amount;
      let withdrawSource: 'AMOUNT_ROLLOVER' | 'ROLLOVER' | null = null;
      let withdrawFromAmount = 0; // Portion taken from main amount

      if (dto.type === TransactionType.DEPOSIT) {
        updatedAmount += amountInUSD;
        updatedTotalAmount += amountInUSD;

      } else if (dto.type === TransactionType.WITHDRAWAL) {
        if (amountInUSD > investor.amount) {
          throw new BadRequestException('Withdrawal exceeds total balance');
        }

        if (amountInUSD <= investor.rollover_amount) {
          updatedRollover -= amountInUSD;
          updatedTotalAmount -= amountInUSD;
          withdrawSource = 'ROLLOVER';
        } else {
          withdrawFromAmount = amountInUSD - investor.rollover_amount;
          updatedAmount -= withdrawFromAmount;
          updatedRollover = 0;
          updatedTotalAmount -= amountInUSD;
          withdrawSource = 'AMOUNT_ROLLOVER';
        }
      }

      // Update investor balances
      await tx.investors.update({
        where: { id: dto.investorId },
        data: {
          amount: updatedAmount,
          rollover_amount: updatedRollover,
          total_amount: updatedTotalAmount,
        },
      });

      // Use provided date or fallback to now
      const transactionDate = dto.date ? new Date(dto.date) : new Date();

      // Create transaction record
      return tx.transaction.create({
        data: {
          investorId: dto.investorId,
          type: dto.type,
          amount: dto.amount, // original entered
          currency: settings.defaultCurrency, // enforce default
          withdrawSource,
          withdrawFromAmount, // save portion from main amount
          date: transactionDate,
        },
      });
    });
  }

  async cancelTransaction(currentUserId: number, id: number) {
    await this.checkAdmin(currentUserId);

    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.status === 'CANCELED') throw new BadRequestException('Transaction is already canceled');

    const investor = await this.prisma.investors.findUnique({ where: { id: tx.investorId } });
    if (!investor) throw new BadRequestException('Investor not found');

    const settings = await this.prisma.settings.findFirst();
    if (!settings) throw new BadRequestException('Settings not found');

    // Convert transaction amount to USD
    let amountInUSD = 0;
    if (tx.currency === 'USD') amountInUSD = tx.amount;
    else if (tx.currency === 'IQD') amountInUSD = tx.amount / settings.USDtoIQD;

    return this.prisma.$transaction(async (prismaTx) => {
      let updatedAmount = investor.amount;
      let updatedRollover = investor.rollover_amount;
      let updatedTotal = investor.total_amount;

      if (tx.type === TransactionType.DEPOSIT) {
        updatedAmount -= amountInUSD;
        updatedTotal -= amountInUSD;

      } else if (tx.type === TransactionType.WITHDRAWAL) {
        // Reverse withdrawal
        updatedTotal += amountInUSD;

        if (tx.withdrawSource === 'ROLLOVER') {
          updatedRollover += amountInUSD;
        } else if (tx.withdrawSource === 'AMOUNT_ROLLOVER') {
          const mainAmountPart = tx.withdrawFromAmount || 0;
          const rolloverPart = amountInUSD - mainAmountPart;
          updatedAmount += mainAmountPart;
          updatedRollover += rolloverPart;
        }
      } else if (tx.type === TransactionType.PROFIT) {
        updatedRollover -= amountInUSD;
        updatedTotal -= amountInUSD;
      }

      if (updatedAmount < 0 || updatedRollover < 0 || updatedTotal < 0) {
        throw new BadRequestException('Cancel would result in negative balance');
      }

      // Update investor balances
      await prismaTx.investors.update({
        where: { id: tx.investorId },
        data: {
          amount: updatedAmount,
          rollover_amount: updatedRollover,
          total_amount: updatedTotal,
        },
      });

      // ✅ Mark transaction as canceled instead of deleting
      await prismaTx.transaction.update({
        where: { id },
        data: { status: 'CANCELED' },
      });

      return { message: `Transaction ${id} canceled successfully`, canceledId: id };
    });
  }

  async deleteTransactions(currentUserId: number, ids: number | number[]) {
    await this.checkAdmin(currentUserId);

    const transactionIds = Array.isArray(ids) ? ids : [ids];

    const existingTransactions = await this.prisma.transaction.findMany({
      where: { id: { in: transactionIds } },
    });

    if (existingTransactions.length !== transactionIds.length) {
      throw new NotFoundException('Some transactions were not found');
    }

    // Cancel transactions if not already canceled
    for (const tx of existingTransactions) {
      if (tx.status !== 'CANCELED') {
        await this.cancelTransaction(currentUserId, tx.id);
      }
    }

    await this.prisma.transaction.deleteMany({
      where: { id: { in: transactionIds } },
    });

    return {
      message: `Transactions ${transactionIds.join(', ')} deleted successfully`,
      deletedIds: transactionIds,
    };
  }

  async getTransactions(currentUserId: number, page: number = 1, query?: GetTransactionsDto) {
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
    if (query?.investorId) filters.investorId = Number(query.investorId);
    if (query?.status) filters.status = query.status; // <-- add this

    const yearFilter: any = {};
    if (query?.year) yearFilter.year = Number(query.year);
    if (query?.periodName) yearFilter.periodName = { contains: query.periodName, mode: 'insensitive' };

    const totalTransactions = await this.prisma.transaction.count({
      where: { ...filters, financialYear: Object.keys(yearFilter).length ? yearFilter : undefined },
    });

    const totalPages = Math.ceil(totalTransactions / limit);
    if (page > totalPages && totalTransactions > 0) throw new NotFoundException('Page not found');

    const skip = (page - 1) * limit;

    const transactions = await this.prisma.transaction.findMany({
      where: { ...filters, financialYear: Object.keys(yearFilter).length ? yearFilter : undefined },
      skip,
      take: Number(limit),
      orderBy: { date: 'desc' },
      include: {
        investors: { select: { fullName: true, phone: true } },
        financialYear: { select: { year: true, periodName: true } },
      },
    });

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