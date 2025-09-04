import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateTransactionDto, GetTransactionsDto, TransactionType } from './dto/transactions.dto';
import { Role } from '@prisma/client';
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

        // Check if user exists
        const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
        if (!user) throw new BadRequestException('User does not exist');

        // Check if user is an investor
        const investor = await this.prisma.investors.findUnique({ where: { userId: dto.userId } });
        if (!investor) throw new BadRequestException('User is not an investor');

        // Load settings (user-specific or fallback to first)
        let settings = await this.prisma.settings.findUnique({ where: { userId: dto.userId } });
        if (!settings) {
            settings = await this.prisma.settings.findFirst();
            if (!settings) {
                throw new BadRequestException('Settings not found');
            }
        }

        // Convert amount to IQD if needed
        let amountInIQD = dto.amount;
        if (settings.defaultCurrency === 'USD') {
            amountInIQD = dto.amount * settings.USDtoIQD;
        }

        // Start transaction to ensure atomicity
        const result = await this.prisma.$transaction(async (prisma) => {
            // Update investor amount based on transaction type
            let updatedAmount = investor.amount;
            if (dto.type === 'deposit') {
                updatedAmount += amountInIQD;
            } else if (dto.type === 'withdrawal') {
                if (amountInIQD > investor.amount) {
                    throw new BadRequestException('Withdrawal amount exceeds investor balance');
                }
                updatedAmount -= amountInIQD;
            }

            await prisma.investors.update({
                where: { userId: dto.userId },
                data: { amount: updatedAmount },
            });

            // Create the transaction (store original currency & amount)
            const transaction = await prisma.transaction.create({
                data: {
                    userId: dto.userId,
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
        query?: GetTransactionsDto
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

        // If admin -> allow filtering by userId
        if (user.role === Role.ADMIN) {
            if (query?.userId) {
                filters.userId = Number(query.userId);
            }
        } else {
            // Non-admins can only see their own transactions
            filters.userId = currentUserId;
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
            include: { user: { select: { fullName: true, phone: true } } },
        });

        // ✅ Timezone formatting
        let settings = await this.prisma.settings.findUnique({ where: { userId: currentUserId } });
        if (!settings) {
            settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
            if (!settings) throw new NotFoundException('Admin settings not found');
        }
        const timezone = settings?.timezone || 'UTC';

        const formattedTransactions = transactions.map(tx => ({
            ...tx,
            date: DateTime
                .fromJSDate(tx.date, { zone: 'utc' })
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