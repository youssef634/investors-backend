import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class InvestorsService {
    constructor(private prisma: PrismaService) { }

    private async checkAdmin(userId: number) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can manage investors');
        }
    }

    async addInvestor(
        currentUserId: number,
        data: { userName: string; phone: string; amount: number },
    ) {
        await this.checkAdmin(currentUserId);

        const user = await this.prisma.user.findUnique({
            where: { userName: data.userName },
        });

        if (!user) {
            throw new BadRequestException(
                `User with username "${data.userName}" does not exist`,
            );
        }

        return this.prisma.investors.create({
            data: {
                ...data,
                createdAt: new Date(),
            },
        });
    }

    async updateInvestor(
        currentUserId: number,
        id: number,
        data: Partial<{ phone: string; amount: number; createdAt: Date }>,
    ) {
        await this.checkAdmin(currentUserId);

        const allowedFields: any = {};
        if (data.phone !== undefined) allowedFields.phone = data.phone;
        if (data.amount !== undefined) allowedFields.amount = data.amount;
        if (data.createdAt !== undefined) allowedFields.createdAt = data.createdAt;

        return this.prisma.investors.update({
            where: { id },
            data: allowedFields,
        });
    }

    async deleteInvestor(currentUserId: number, id: number) {
        await this.checkAdmin(currentUserId);

        return this.prisma.investors.delete({
            where: { id },
        });
    }

    async getInvestors(
        currentUserId: number,
        page: number = 1,
        searchFilters?: {
            limit?: number;
            search?: string;
            phone?: string; 
            userName?: string;
            minAmount?: number;
            maxAmount?: number;
            startDate?: string; // ISO string
            endDate?: string;   // ISO string
            minShare?: number;
            maxShare?: number;
        },
    ) {
        await this.checkAdmin(currentUserId);

        const limit = searchFilters?.limit && searchFilters.limit > 0 ? searchFilters.limit : 10;

        // Build filters for pagination/search
        const filters: any = {};
        if (searchFilters?.search) {
            filters.OR = [
                { userName: { contains: searchFilters.search, mode: 'insensitive' } },
                { phone: { contains: searchFilters.search, mode: 'insensitive' } },
                // Remove contains filter for numeric/date fields
                { amount: { equals: Number(searchFilters.search) || undefined } },
            ];
        }
        if (searchFilters?.phone)
            filters.phone = { contains: searchFilters.phone, mode: 'insensitive' };
        if (searchFilters?.userName)
            filters.userName = { contains: searchFilters.userName, mode: 'insensitive' };
        if (searchFilters?.minAmount !== undefined || searchFilters?.maxAmount !== undefined)
            filters.amount = {
                gte: searchFilters.minAmount ?? undefined,
                lte: searchFilters.maxAmount ?? undefined,
            };
        if (searchFilters?.startDate || searchFilters?.endDate)
            filters.createdAt = {
                gte: searchFilters.startDate ? new Date(searchFilters.startDate) : undefined,
                lte: searchFilters.endDate ? new Date(searchFilters.endDate) : undefined,
            };

        // Count total investors for pagination
        const totalInvestors = await this.prisma.investors.count({ where: filters });

        const totalPages = Math.ceil(totalInvestors / limit);
        if (page > totalPages && totalInvestors > 0) throw new NotFoundException('Page not found');

        const skip = (page - 1) * limit;

        // Fetch paginated investors
        const investors = await this.prisma.investors.findMany({
            where: filters,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        });

        // Calculate sharePercentage using ALL investors, ignoring pagination/search filters
        const totalAmountAll = (await this.prisma.investors.aggregate({ _sum: { amount: true } }))._sum.amount || 0;

        const investorsWithShares = investors
            .map((inv) => ({
                ...inv,
                sharePercentage: totalAmountAll > 0 ? (inv.amount / totalAmountAll) * 100 : 0,
            }))
            // Apply share percentage filter AFTER calculating using all investors
            .filter((inv) => {
                if (searchFilters?.minShare !== undefined && inv.sharePercentage < searchFilters.minShare) return false;
                if (searchFilters?.maxShare !== undefined && inv.sharePercentage > searchFilters.maxShare) return false;
                return true;
            });

        return {
            totalInvestors: investorsWithShares.length,
            totalPages,
            currentPage: page,
            totalAmount: totalAmountAll,
            investors: investorsWithShares,
        };
    }
}