import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateTransactionDto, GetTransactionsDto, TransactionType } from './dto/transactions.dto';
import { Role } from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  private async checkAdmin(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can perform this action');
    }
  }

  async addTransaction(currentUserId: number, dto: CreateTransactionDto) {
    await this.checkAdmin(currentUserId);

    // Check if investor exists
    const investor = await this.prisma.investors.findUnique({ where: { id: dto.investorId } });
    if (!investor) throw new BadRequestException('Investor does not exist');

    // Load settings (fallback to first admin settings)
    let settings = await this.prisma.settings.findFirst();
    if (!settings) {
      throw new BadRequestException('Settings not found');
    }

    // Convert to IQD if needed
    let amountInIQD = dto.amount;
    if (settings.defaultCurrency === 'USD') {
      amountInIQD = dto.amount * settings.USDtoIQD;
    }

    // Apply transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      let updatedAmount = investor.amount;

      if (dto.type === TransactionType.DEPOSIT) {
        updatedAmount += amountInIQD;
      } else if (dto.type === TransactionType.WITHDRAWAL) {
        if (amountInIQD > investor.amount) {
          throw new BadRequestException('Withdrawal exceeds investor balance');
        }
        updatedAmount -= amountInIQD;
      } else if (dto.type === TransactionType.PROFIT) {
        updatedAmount += amountInIQD;
      } else {
        throw new BadRequestException(`Invalid transaction type: ${dto.type}`);
      }

      // Update investor
      await prisma.investors.update({
        where: { id: dto.investorId },
        data: { amount: updatedAmount },
      });

      // Save transaction
      const transaction = await prisma.transaction.create({
        data: {
          investorId: dto.investorId,
          type: dto.type,
          amount: dto.amount, // keep original input
          currency: settings.defaultCurrency,
          date: new Date(),
        },
      });

      return transaction;
    });

    return result;
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

    const totalTransactions = await this.prisma.transaction.count({ where: filters });
    const totalPages = Math.ceil(totalTransactions / limit);
    if (page > totalPages && totalTransactions > 0) throw new NotFoundException('Page not found');

    const skip = (page - 1) * limit;

    const transactions = await this.prisma.transaction.findMany({
      where: filters,
      skip,
      take: Number(limit),
      orderBy: { date: 'desc' },
      include: {
        investors: { select: { fullName: true, email: true } },
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