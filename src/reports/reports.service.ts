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

    private async investorsDate(date: Date | null, userId: number): Promise<string | null> {
        if (!date) return null;

        let settings = await this.prisma.settings.findUnique({ where: { userId } });
        if (!settings) {
            settings = await this.prisma.settings.findFirst();
            if (!settings) throw new NotFoundException('Settings not found');
        }

        const timezone = settings?.timezone || 'UTC';

        return DateTime.fromJSDate(date, { zone: 'utc' })
            .setZone(timezone)
            .toFormat('MMM dd, yyyy');
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
                phone: true,
                amount: true,
                rollover_amount: true,
                total_amount: true,
                createdAt: true,
                profitDistributions: {
                    select: {
                        amount: true,
                        percentage: true,
                        dailyProfit: true,
                        totalProfit: true,
                        daysSoFar: true,
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

        // total of all investors for percentage calculation
        const totalAmountAll =
            (await this.prisma.investors.aggregate({ _sum: { amount: true } }))._sum.amount || 0;

        // format dates and add sharePercentage
        return Promise.all(
            investors.map(async (inv) => {
                const sharePercentage = totalAmountAll > 0 ? (inv.amount / totalAmountAll) * 100 : 0;

                return {
                    ...inv,
                    sharePercentage,
                    createdAt: await this.investorsDate(inv.createdAt, userId),
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
                };
            })
        );
    }

    /** 2️⃣ Investor individual */
    async getInvestorById(userId: number, role: Role, id: number, periodName?: string) {
        if (role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can access this report');
        }

        const investor = await this.prisma.investors.findUnique({
            where: { id },
            select: {
                id: true,
                fullName: true,
                phone: true,
                amount: true,
                rollover_amount: true,
                total_amount: true,
                createdAt: true,
                transactions: {
                    select: {
                        id: true,
                        type: true,
                        amount: true,
                        currency: true,
                        date: true,
                        withdrawSource: true,
                        withdrawFromAmount: true,
                        status: true,
                        financialYear: { select: { year: true, periodName: true } },
                    },
                    orderBy: { date: 'desc' },
                },
                profitDistributions: {
                    where: periodName ? { financialYear: { periodName } } : undefined,
                    select: {
                        amount: true,
                        percentage: true,
                        dailyProfit: true,
                        totalProfit: true,
                        daysSoFar: true,
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

        // calculate share percentage against all investors
        const totalAmountAll =
            (await this.prisma.investors.aggregate({ _sum: { amount: true } }))._sum.amount || 0;
        const sharePercentage = totalAmountAll > 0 ? (investor.amount / totalAmountAll) * 100 : 0;

        return {
            ...investor,
            sharePercentage, // ⬅ added here
            createdAt: await this.investorsDate(investor.createdAt, userId),
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
    async getTransactionsReport(
        userId: number,
        role: Role,
        startDate?: Date,
        endDate?: Date,
        periodName?: string,   // 👈 new optional param
    ) {
        if (role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can access this report');
        }

        const where: any = {};
        if (startDate && endDate) {
            where.date = { gte: startDate, lte: endDate };
        }

        // 👇 add search by financial year periodName
        if (periodName) {
            where.financialYear = {
                periodName: {
                    contains: periodName, // partial match, case-sensitive
                    mode: 'insensitive',  // case-insensitive match
                },
            };
        }

        const transactions = await this.prisma.transaction.findMany({
            where,
            select: {
                id: true,
                type: true,
                amount: true,
                currency: true,
                date: true,
                withdrawSource: true,
                withdrawFromAmount: true,
                status: true,
                financialYear: { select: { year: true, periodName: true } },
                investors: {
                    select: { id: true, fullName: true },
                },
            },
            orderBy: { date: 'desc' },
        });

        return Promise.all(
            transactions.map(async (tx) => ({
                ...tx,
                date: await this.formatDate(tx.date, userId),
                investors: {
                    ...tx.investors,
                },
            })),
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
                transactions: {
                    select: {
                        id: true,
                        type: true,
                        amount: true,
                        date: true,
                    }
                },
                profitDistributions: {
                    select: {
                        amount: true,
                        percentage: true,
                        dailyProfit: true,
                        totalProfit: true,
                        daysSoFar: true,
                        isRollover: true,
                        investors: {
                            select: {
                                id: true,
                                fullName: true,
                                phone: true,
                                amount: true,
                                rollover_amount: true,
                                total_amount: true,
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
            startDate: await this.investorsDate(year.startDate, userId),
            endDate: await this.investorsDate(year.endDate, userId),
            approvedAt: await this.formatDate(year.approvedAt, userId),
            distributedAt: await this.investorsDate(year.distributedAt, userId),
            createdAt: await this.formatDate(year.createdAt, userId),
            profitDistributions: await Promise.all(
                year.profitDistributions.map(async (pd) => ({
                    ...pd,
                    investors: {
                        ...pd.investors,
                        createdAt: await this.investorsDate(pd.investors.createdAt, userId),
                    },
                }))
            ),
        };
    }
}