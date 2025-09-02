import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateTransactionDto, GetTransactionsDto, TransactionType } from './dto/transactions.dto';
import { Role } from '@prisma/client';

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

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new BadRequestException('User does not exist');

    //const settings = await this.prisma.settings.findFirst();
    //if (!settings) throw new BadRequestException('Settings not found');

    const transaction = await this.prisma.transaction.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        amount: dto.amount,
        currency: "IQD",
        date: new Date(),
      },
    });

    return transaction;
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
    query?: GetTransactionsDto
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUserId } });
    if (!user) throw new ForbiddenException('User not found');

    const limit = query?.limit && query.limit > 0 ? query.limit : 10;
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

    // Users can see only their own transactions
    if (user.role !== Role.ADMIN) filters.userId = currentUserId;

    const totalTransactions = await this.prisma.transaction.count({ where: filters });
    const totalPages = Math.ceil(totalTransactions / limit);
    if (page > totalPages && totalTransactions > 0) throw new NotFoundException('Page not found');

    const skip = (page - 1) * limit;

    const transactions = await this.prisma.transaction.findMany({
      where: filters,
      skip,
      take: limit,
      orderBy: { date: 'desc' },
      include: { user: { select: { fullName: true, phone: true } } },
    });

    return {
      totalTransactions,
      totalPages,
      currentPage: page,
      transactions,
    };
  }
}
