import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class ReportsService {
    constructor(private prisma: PrismaService) { }

    /** 1️⃣ Investors report */
    async getInvestorsReport(role: Role, startDate?: Date, endDate?: Date) {
        if (role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can access this report');
        }

        const where: any = {};
        if (startDate && endDate) {
            where.createdAt = { gte: startDate, lte: endDate };
        }

        return this.prisma.investors.findMany({
            where,
            select: {
                id: true,
                fullName: true,
                email: true,
                amount: true,
                createdAt: true,
                profitDistributions: {
                    select: {
                        amount: true,
                        percentage: true,
                        totalProfit: true,
                        financialYear: {
                            select: {
                                year: true,
                                periodName: true,
                                totalProfit: true,
                                currency: true,
                                startDate: true,
                                endDate: true,
                                totalDays: true,
                                dailyProfit: true,
                                status: true,
                                rolloverEnabled: true,
                                rolloverPercentage: true,
                                createdById: true,
                                approvedById: true,
                                distributedById: true,
                                approvedAt: true,
                                distributedAt: true,
                                createdAt: true,
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /** 2️⃣ Investor individual */
    async getInvestorById(role: Role, id: number) {
        if (role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can access this report');
        }

        const investor = await this.prisma.investors.findUnique({
            where: { id },
            select: {
                id: true,
                fullName: true,
                email: true,
                amount: true,
                createdAt: true,
                transactions: {
                    select: { id: true, type: true, amount: true, currency: true, date: true },
                    orderBy: { date: 'desc' },
                },
                profitDistributions: {
                    select: {
                        amount: true,
                        percentage: true,
                        totalProfit: true,
                        financialYear: {
                            select: {
                                year: true,
                                periodName: true,
                                totalProfit: true,
                                currency: true,
                                startDate: true,
                                endDate: true,
                                totalDays: true,
                                dailyProfit: true,
                                status: true,
                                rolloverEnabled: true,
                                rolloverPercentage: true,
                                createdById: true,
                                approvedById: true,
                                distributedById: true,
                                approvedAt: true,
                                distributedAt: true,
                                createdAt: true,
                            },
                        },
                    },
                },
            },
        });

        if (!investor) throw new NotFoundException('Investor not found');
        return investor;
    }

    /** 3️⃣ Transactions report */
    async getTransactionsReport(role: Role, startDate?: Date, endDate?: Date) {
        if (role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can access this report');
        }

        const where: any = {};
        if (startDate && endDate) {
            where.date = { gte: startDate, lte: endDate };
        }

        return this.prisma.transaction.findMany({
            where,
            include: { investors: true },
            orderBy: { date: 'desc' },
        });
    }

    /** 4️⃣ Financial year report */
    async getFinancialYearReport(role: Role, periodName: string) {
        if (role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can access this report');
        }

        const year = await this.prisma.financialYear.findUnique({
            where: { periodName },
            select: {
                id: true,
                year: true,
                periodName: true,
                totalProfit: true,
                currency: true,
                startDate: true,
                endDate: true,
                totalDays: true,
                dailyProfit: true,
                status: true,
                rolloverEnabled: true,
                rolloverPercentage: true,
                createdById: true,
                approvedById: true,
                distributedById: true,
                approvedAt: true,
                distributedAt: true,
                createdAt: true,
                profitDistributions: {
                    select: {
                        amount: true,
                        percentage: true,
                        totalProfit: true,
                        investors: {
                            select: {
                                id: true,
                                fullName: true,
                                email: true,
                                amount: true,
                                createdAt: true,
                            },
                        },
                    },
                },
            },
        });

        if (!year) throw new NotFoundException('Financial year not found');
        return year;
    }
}