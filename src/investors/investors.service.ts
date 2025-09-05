import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { Role } from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class InvestorsService {
    constructor(private prisma: PrismaService) { }

    private async checkAdmin(userId: number) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can manage investors');
        }
    }

    async addInvestor(currentUserId: number, userId: number, amount: number) {
        await this.checkAdmin(currentUserId);

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new BadRequestException('User not found');

        const existingInvestor = await this.prisma.investors.findUnique({ where: { userId } });
        if (existingInvestor) throw new BadRequestException('User already invested');

        return this.prisma.investors.create({
            data: { userId, amount, createdAt: new Date() },
        });
    }

    async updateInvestor(currentUserId: number, id: number, amount: number) {
        await this.checkAdmin(currentUserId);

        return this.prisma.investors.update({
            where: { id },
            data: { amount },
        });
    }

    async deleteInvestor(currentUserId: number, id: number) {
        await this.checkAdmin(currentUserId);

        return this.prisma.investors.delete({ where: { id } });
    }

    async getInvestors(
        currentUserId: number,
        page: number = 1,
        searchFilters?: {
            limit?: number;
            userId?: number;
            fullName?: any;
            minAmount?: number;
            maxAmount?: number;
            startDate?: string;
            endDate?: string;
            minShare?: number;
            maxShare?: number;
        },
    ) {
        await this.checkAdmin(currentUserId);

        const limit = searchFilters?.limit && searchFilters.limit > 0 ? searchFilters.limit : 10;
        const filters: any = {};

        // Search filter
        if (searchFilters?.fullName) {
            filters.OR = [
                { user: { fullName: { contains: searchFilters.fullName, mode: 'insensitive' } } },
            ];
        }

        // Specific user filter
        if (searchFilters?.userId) {
            filters.userId = searchFilters.userId;
        }

        // Amount range filter
        if (searchFilters?.minAmount !== undefined || searchFilters?.maxAmount !== undefined) {
            filters.amount = {};
            if (searchFilters.minAmount !== undefined) filters.amount.gte = searchFilters.minAmount;
            if (searchFilters.maxAmount !== undefined) filters.amount.lte = searchFilters.maxAmount;
        }

        // Date range filter
        if (searchFilters?.startDate || searchFilters?.endDate) {
            filters.createdAt = {};
            if (searchFilters.startDate) filters.createdAt.gte = new Date(searchFilters.startDate);
            if (searchFilters.endDate) filters.createdAt.lte = new Date(searchFilters.endDate);
        }

        // Pagination
        const totalInvestors = await this.prisma.investors.count({ where: filters });
        const totalPages = Math.ceil(totalInvestors / limit);
        if (page > totalPages && totalInvestors > 0) throw new NotFoundException('Page not found');

        const skip = (page - 1) * limit;

        const investors = await this.prisma.investors.findMany({
            where: filters,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { fullName: true } } },
        });

        const totalAmountAll = (await this.prisma.investors.aggregate({ _sum: { amount: true } }))._sum.amount || 0;

        const investorsWithShares = investors
            .map(inv => ({
                id: inv.id,
                userId: inv.userId,
                fullName: inv.user.fullName,
                amount: inv.amount,
                profit: inv.profit,
                createdAt: inv.createdAt,
                sharePercentage: totalAmountAll > 0 ? (inv.amount / totalAmountAll) * 100 : 0,
            }))
            .filter(inv => {
                if (searchFilters?.minShare !== undefined && inv.sharePercentage < searchFilters.minShare) return false;
                if (searchFilters?.maxShare !== undefined && inv.sharePercentage > searchFilters.maxShare) return false;
                return true;
            });

        // ✅ Timezone formatting
        let settings = await this.prisma.settings.findUnique({ where: { userId: currentUserId } });
        if (!settings) {
            settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
            if (!settings) throw new NotFoundException('Admin settings not found');
        }
        const timezone = settings?.timezone || 'UTC';

        const formattedInvestors = investorsWithShares.map(inv => ({
            ...inv,
            createdAt: DateTime
                .fromJSDate(inv.createdAt, { zone: 'utc' })
                .setZone(timezone)
                .toFormat('MMM dd, yyyy, hh:mm a'),
        }));

        return {
            totalInvestors: formattedInvestors.length,
            totalPages,
            currentPage: page,
            totalAmount: totalAmountAll,
            investors: formattedInvestors,
        };
    }
}