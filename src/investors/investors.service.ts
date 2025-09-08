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

    async addInvestor(
        currentUserId: number,
        fullName: string,
        phone: string,
        amount: number,
        createdAt?: Date
    ) {
        await this.checkAdmin(currentUserId);

        const existingInvestor = await this.prisma.investors.findUnique({ where: { phone } });
        if (existingInvestor) {
            throw new BadRequestException('Investor with this phone already exists');
        }

        return this.prisma.investors.create({
            data: {
                fullName,
                phone,
                amount,
                createdAt: createdAt ?? new Date(),
            },
        });
    }

    async updateInvestor(
        currentUserId: number,
        id: number,
        dto: { fullName?: string; amount?: number; phone?: string; createdAt?: Date }
    ) {
        await this.checkAdmin(currentUserId);

        const investor = await this.prisma.investors.findUnique({ where: { id } });
        if (!investor) throw new NotFoundException('Investor not found');

        const updateData: any = {};
        if (dto.fullName !== undefined) updateData.fullName = dto.fullName;
        if (dto.amount !== undefined) updateData.amount = dto.amount;
        if (dto.phone !== undefined) updateData.phone = dto.phone;          // ✅ update phone
        if (dto.createdAt !== undefined) updateData.createdAt = dto.createdAt; // ✅ update createdAt

        return this.prisma.investors.update({
            where: { id },
            data: updateData,
        });
    }

    async deleteInvestor(currentUserId: number, id: number) {
        await this.checkAdmin(currentUserId);

        const investor = await this.prisma.investors.findUnique({ where: { id } });
        if (!investor) throw new NotFoundException('Investor not found');

        await this.prisma.$transaction(async (tx) => {
            // Delete related transactions
            await tx.transaction.deleteMany({ where: { investorId: id } });

            // Delete related profit distributions
            await tx.yearlyProfitDistribution.deleteMany({ where: { investorId: id } });

            // Finally, delete investor
            await tx.investors.delete({ where: { id } });
        });

        return { message: `Investor ${id} and related data deleted successfully`, deletedId: id };
    }

    async getInvestors(
        currentUserId: number,
        page: number = 1,
        searchFilters?: {
            limit?: number;
            fullName?: string;
            email?: string;
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

        if (searchFilters?.fullName) {
            filters.fullName = { contains: searchFilters.fullName, mode: 'insensitive' };
        }
        if (searchFilters?.email) {
            filters.email = { contains: searchFilters.email, mode: 'insensitive' };
        }
        if (searchFilters?.minAmount !== undefined || searchFilters?.maxAmount !== undefined) {
            filters.amount = {};
            if (searchFilters.minAmount !== undefined) filters.amount.gte = searchFilters.minAmount;
            if (searchFilters.maxAmount !== undefined) filters.amount.lte = searchFilters.maxAmount;
        }
        if (searchFilters?.startDate || searchFilters?.endDate) {
            filters.createdAt = {};
            if (searchFilters.startDate) filters.createdAt.gte = new Date(searchFilters.startDate);
            if (searchFilters.endDate) filters.createdAt.lte = new Date(searchFilters.endDate);
        }

        const totalInvestors = await this.prisma.investors.count({ where: filters });
        const totalPages = Math.ceil(totalInvestors / limit);
        if (page > totalPages && totalInvestors > 0) throw new NotFoundException('Page not found');

        const skip = (page - 1) * limit;

        const investors = await this.prisma.investors.findMany({
            where: filters,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        });

        const totalAmountAll = (await this.prisma.investors.aggregate({ _sum: { amount: true } }))._sum.amount || 0;
        const totalProfirAll = (await this.prisma.investors.aggregate({ _sum: { rollover_amount: true } }))._sum.rollover_amount || 0;

        // ✅ timezone formatting
        const settings = await this.prisma.settings.findFirst();
        const timezone = settings?.timezone || 'UTC';

        let formattedInvestors = investors.map((inv) => {
            const sharePercentage = totalAmountAll > 0 ? (inv.amount / totalAmountAll) * 100 : 0;

            return {
                id: inv.id,
                fullName: inv.fullName,
                phone: inv.phone,
                amount: inv.amount,
                rollover: inv.rollover_amount,
                sharePercentage,
                createdAt: DateTime.fromJSDate(inv.createdAt, { zone: 'utc' })
                    .setZone(timezone)
                    .toFormat('MMM dd, yyyy, hh:mm a'),
            };
        });

        if (searchFilters?.minShare !== undefined) {
            formattedInvestors = formattedInvestors.filter(
                (inv) => inv.sharePercentage >= searchFilters.minShare!,
            );
        }
        if (searchFilters?.maxShare !== undefined) {
            formattedInvestors = formattedInvestors.filter(
                (inv) => inv.sharePercentage <= searchFilters.maxShare!,
            );
        }

        return {
            totalInvestors: formattedInvestors.length,
            totalPages,
            currentPage: page,
            totalAmount: totalAmountAll,
            totalRollover: totalProfirAll,
            investors: formattedInvestors,
        };
    }
}