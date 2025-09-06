import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { Role } from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class ReportsService {
    constructor(private prisma: PrismaService) { }

    /** Format a date based on user's timezone */
    private async formatDate(date: Date | null, userId: number): Promise<string | null> {
        if (!date) return null;

        let settings = await this.prisma.settings.findUnique({ where: { userId } });
        if (!settings) {
            settings = await this.prisma.settings.findFirst();
            if (!settings) throw new NotFoundException('Settings not found');
        }

        const timezone = settings?.timezone || 'UTC';

        return DateTime.fromJSDate(date, { zone: 'utc' })
            .setZone(timezone)
            .toFormat('MMM dd, yyyy, hh:mm a');
    }

    /** 1️⃣ Investors report */
    async getInvestorsReport(userId: number, role: Role, startDate?: Date, endDate?: Date) {
        if (role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can access this report');
        }

        const where: any = {};
        if (startDate && endDate) {
            where.createdAt = { gte: startDate, lte: endDate };
        }

        const investors = await this.prisma.investors.findMany({
            where,
            select: {
                id: true,
                fullName: true,
                email: true,
                amount: true,
                profit: true,
                createdAt: true,
                profitDistributions: {
                    select: {
                        amount: true,
                        percentage: true,
                        totalProfit: true,
                        isRollover: true,
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

        // format dates
        return Promise.all(
            investors.map(async (inv) => ({
                ...inv,
                createdAt: await this.formatDate(inv.createdAt, userId),
                profitDistributions: await Promise.all(
                    inv.profitDistributions.map(async (pd) => ({
                        ...pd,
                        financialYear: {
                            ...pd.financialYear,
                            startDate: await this.formatDate(pd.financialYear.startDate, userId),
                            endDate: await this.formatDate(pd.financialYear.endDate, userId),
                            approvedAt: await this.formatDate(pd.financialYear.approvedAt, userId),
                            distributedAt: await this.formatDate(pd.financialYear.distributedAt, userId),
                            createdAt: await this.formatDate(pd.financialYear.createdAt, userId),
                        },
                    }))
                ),
            }))
        );
    }

    /** 2️⃣ Investor individual */
    async getInvestorById(userId: number, role: Role, id: number) {
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
                profit: true,
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
                        isRollover: true,
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

        return {
            ...investor,
            createdAt: await this.formatDate(investor.createdAt, userId),
            transactions: await Promise.all(
                investor.transactions.map(async (tx) => ({
                    ...tx,
                    date: await this.formatDate(tx.date, userId),
                }))
            ),
            profitDistributions: await Promise.all(
                investor.profitDistributions.map(async (pd) => ({
                    ...pd,
                    financialYear: {
                        ...pd.financialYear,
                        startDate: await this.formatDate(pd.financialYear.startDate, userId),
                        endDate: await this.formatDate(pd.financialYear.endDate, userId),
                        approvedAt: await this.formatDate(pd.financialYear.approvedAt, userId),
                        distributedAt: await this.formatDate(pd.financialYear.distributedAt, userId),
                        createdAt: await this.formatDate(pd.financialYear.createdAt, userId),
                    },
                }))
            ),
        };
    }

    /** 3️⃣ Transactions report */
    async getTransactionsReport(userId: number, role: Role, startDate?: Date, endDate?: Date) {
        if (role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can access this report');
        }

        const where: any = {};
        if (startDate && endDate) {
            where.date = { gte: startDate, lte: endDate };
        }

        const transactions = await this.prisma.transaction.findMany({
            where,
            include: { investors: true },
            orderBy: { date: 'desc' },
        });

        return Promise.all(
            transactions.map(async (tx) => ({
                ...tx,
                date: await this.formatDate(tx.date, userId),
                investors: {
                    ...tx.investors,
                    createdAt: await this.formatDate(tx.investors.createdAt, userId),
                },
            }))
        );
    }

    /** 4️⃣ Financial year report */
    async getFinancialYearReport(userId: number, role: Role, periodName: string) {
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
                        isRollover: true,
                        investors: {
                            select: {
                                id: true,
                                fullName: true,
                                email: true,
                                amount: true,
                                profit: true,
                                createdAt: true,
                            },
                        },
                    },
                },
            },
        });

        if (!year) throw new NotFoundException('Financial year not found');

        return {
            ...year,
            startDate: await this.formatDate(year.startDate, userId),
            endDate: await this.formatDate(year.endDate, userId),
            approvedAt: await this.formatDate(year.approvedAt, userId),
            distributedAt: await this.formatDate(year.distributedAt, userId),
            createdAt: await this.formatDate(year.createdAt, userId),
            profitDistributions: await Promise.all(
                year.profitDistributions.map(async (pd) => ({
                    ...pd,
                    investors: {
                        ...pd.investors,
                        createdAt: await this.formatDate(pd.investors.createdAt, userId),
                    },
                }))
            ),
        };
    }
}