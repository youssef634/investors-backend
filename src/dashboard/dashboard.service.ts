import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, subWeeks } from 'date-fns';
import { DateTime } from 'luxon';

@Injectable()
export class DashboardService {
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
            .toFormat('MMM dd, yyyy');
    }

    /** 1️⃣ Overview stats */
    async getOverview(userId: number) {
        // ✅ Get settings (for currency info if you need it later)
        let settings = await this.prisma.settings.findUnique({ where: { userId } });
        if (!settings) {
            settings = await this.prisma.settings.findFirst();
            if (!settings) throw new NotFoundException('Settings not found');
        }
        const { defaultCurrency } = settings;

        // 1️⃣ Total investors
        const totalInvestors = await this.prisma.investors.count();

        // 2️⃣ Total amount (from investors table)
        const { _sum: investorSums } = await this.prisma.investors.aggregate({
            _sum: {
                amount: true,
                rollover_amount: true,
                total_amount: true, // adjust if your column name is different
            },
        });

        const totalInvested = investorSums.amount ?? 0;
        const totalRollover = investorSums.rollover_amount ?? 0;
        const totalAmount = investorSums.total_amount ?? 0;

        // 3️⃣ Total transactions count where it is not cancelled
        const totalTransactions = await this.prisma.transaction.count({
            where: { status: "PENDING" }
        }
        );

        return {
            totalInvestors,
            totalInvested,
            totalRollover,
            totalAmount,
            totalTransactions,
            currency: defaultCurrency,
        };
    }

    /** 2️⃣ Aggregates by period (amount + rollover) */
    async getAggregates(
        period: 'week' | 'month' | 'year' | 'all' = 'all',
        userId?: number
    ) {
        let start: Date | undefined;
        let end: Date | undefined;
        const now = new Date();

        switch (period) {
            case 'week': {
                const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
                const diffToSaturday = (currentDay + 7 - 6) % 7;

                start = new Date(now);
                start.setDate(now.getDate() - diffToSaturday);
                start.setHours(0, 0, 0, 0);

                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
            }
            case 'month':
                start = startOfMonth(now);
                end = endOfMonth(now);
                break;
            case 'year':
                start = startOfYear(now);
                end = endOfYear(now);
                break;
            case 'all':
                start = undefined; // no filter
                end = undefined;   // no filter
                break;
        }

        // Get settings (for currency conversion)
        const settings = await this.prisma.settings.findUnique({
            where: { userId },
        });
        if (!settings) throw new BadRequestException('User settings not found');

        const { defaultCurrency, USDtoIQD } = settings;

        // Build where clause
        const whereClause: any = { status: { not: 'CANCELED' } };
        if (start && end) {
            whereClause.date = { gte: start, lte: end };
        }

        // Fetch transactions
        const transactions = await this.prisma.transaction.findMany({
            where: whereClause,
            select: {
                type: true,
                amount: true,
                currency: true,
                withdrawSource: true,
                withdrawFromAmount: true,
            },
        });

        let totalAmount = 0;
        let totalRollover = 0;

        for (const t of transactions) {
            let amt = t.amount;
            if (t.currency === 'USD' && defaultCurrency === 'IQD') {
                amt = t.amount * USDtoIQD;
            } else if (t.currency === 'IQD' && defaultCurrency === 'USD') {
                amt = t.amount / USDtoIQD;
            }

            if (t.type === 'DEPOSIT') {
                totalAmount += amt;
            } else if (t.type === 'WITHDRAWAL') {
                if (t.withdrawSource === 'ROLLOVER') {
                    totalRollover -= amt;
                } else if (t.withdrawSource === 'AMOUNT_ROLLOVER') {
                    const fromAmount = t.withdrawFromAmount || 0;
                    const fromRollover = amt - fromAmount;
                    totalAmount -= fromAmount;
                    totalRollover -= fromRollover;
                }
            } else if (t.type === 'PROFIT') {
                totalRollover += amt;
            }
        }

        return {
            period,
            startDate: start,
            endDate: end,
            totalAmount,
            totalRollover,
            currency: defaultCurrency,
        };
    }

    /** 3️⃣ Transactions in a date range with daily averages (normalized to default currency) */
    async getTransactionsInRange(
        userId: number,
        startDate?: string | Date | null,
        endDate?: string | Date | null
    ) {
        const today = new Date();

        // ✅ Default: current week (Saturday → Friday)
        const currentDay = today.getDay(); // 0 = Sunday, 6 = Saturday
        const diffToSaturday = (currentDay + 7 - 6) % 7;

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - diffToSaturday);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        // ✅ Parse inputs
        const start = startDate ? new Date(startDate) : weekStart;
        const end = endDate ? new Date(endDate) : weekEnd;

        if (isNaN(start.getTime())) start.setTime(weekStart.getTime());
        if (isNaN(end.getTime())) end.setTime(weekEnd.getTime());

        // Load settings
        let settings = await this.prisma.settings.findUnique({ where: { userId } });
        if (!settings) {
            settings = await this.prisma.settings.findFirst();
            if (!settings) throw new NotFoundException('Settings not found');
        }
        const { defaultCurrency, USDtoIQD } = settings;

        // Fetch transactions (now including profit + rollover)
        const transactions = await this.prisma.transaction.findMany({
            where: {
                status: "PENDING",
                date: { gte: start, lte: end },
                type: { in: ['DEPOSIT', 'WITHDRAWAL', 'PROFIT'] },
            },
            orderBy: { date: 'asc' },
        });

        // Group by day
        const grouped: Record<
            string,
            { deposits: number[]; withdraws: number[]; rollovers: number[] }
        > = {};

        for (const tx of transactions) {
            const day = tx.date.toISOString().split('T')[0];
            if (!grouped[day]) {
                grouped[day] = { deposits: [], withdraws: [], rollovers: [] };
            }

            let normalizedAmount = tx.amount;
            if (defaultCurrency === 'IQD' && tx.currency === 'USD') {
                normalizedAmount = tx.amount * USDtoIQD;
            } else if (defaultCurrency === 'USD' && tx.currency === 'IQD') {
                normalizedAmount = tx.amount / USDtoIQD;
            }

            if (tx.type === 'DEPOSIT') grouped[day].deposits.push(normalizedAmount);
            else if (tx.type === 'WITHDRAWAL') grouped[day].withdraws.push(normalizedAmount);
            else if (tx.type === 'PROFIT') grouped[day].rollovers.push(normalizedAmount);
        }

        // Response with totals + averages
        const dailyStats = Object.entries(grouped).map(([day, { deposits, withdraws, rollovers }]) => ({
            day,
            averageDeposit: deposits.length ? deposits.reduce((a, b) => a + b, 0) / deposits.length : 0,
            averageWithdraw: withdraws.length ? withdraws.reduce((a, b) => a + b, 0) / withdraws.length : 0,
            averageRollover: rollovers.length ? rollovers.reduce((a, b) => a + b, 0) / rollovers.length : 0,
            //totalDeposit: deposits.reduce((a, b) => a + b, 0),
            //totalWithdraw: withdraws.reduce((a, b) => a + b, 0),
            //totalRollover: rollovers.reduce((a, b) => a + b, 0),
            currency: defaultCurrency,
        }));

        return {
            startDate: start,
            endDate: end,
            currency: defaultCurrency,
            days: dailyStats,
        };
    }

    /** 4️⃣ Financial year summary grouped by year */
    async getFinancialYearsSummary(yearsCount: number = 1) {
        const now = new Date();
        const currentYear = now.getFullYear();

        // Build target years (e.g., 2025, 2024, 2023)
        const targetYears = Array.from({ length: yearsCount }, (_, i) => currentYear - i);

        // Get financial years from DB
        const years = await this.prisma.financialYear.findMany({
            where: { year: { in: targetYears } },
            select: {
                year: true,
                periodName: true,
                totalProfit: true,
                status: true,
                rolloverEnabled: true,
                rolloverPercentage: true,
            },
            orderBy: { year: 'desc' },
        });

        // Group them by year
        const grouped: Record<number, any[]> = {};
        for (const y of years) {
            if (!grouped[y.year]) grouped[y.year] = [];
            grouped[y.year].push({
                name: y.periodName || y.year.toString(),
                totalProfit: y.totalProfit,
                status: y.status,
                rolloverEnabled: y.rolloverEnabled,
                rolloverPercentage: y.rolloverPercentage,
            });
        }

        // Convert to array of objects
        return targetYears.map((year) => ({
            year,
            financialYears: grouped[year] || [],
        }));
    }

    /** 5️⃣ Top 5 investors by amount */
    async getTopInvestors(userId: number, limit: number = 5) {
        // Total amount for percentage calculation
        const totalAmountAgg = await this.prisma.investors.aggregate({
            _sum: { total_amount: true },
        });
        const totalAmount = totalAmountAgg._sum.total_amount || 0;

        // Top investors
        const topInvestors = await this.prisma.investors.findMany({
            take: limit,
            orderBy: { amount: 'desc' },
            select: {
                id: true,
                fullName: true,
                phone: true,
                amount: true,
                rollover_amount: true,
                createdAt: true,
            },
        });

        // Format dates and add percentage
        return Promise.all(
            topInvestors.map(async (inv) => ({
                investorId: inv.id,
                fullName: inv.fullName,
                phone: inv.phone,
                amount: inv.amount,
                rolloverAmount: inv.rollover_amount,
                joinedAt: await this.formatDate(inv.createdAt, userId),
                percentageOfTotal: totalAmount > 0 ? (inv.amount / totalAmount) * 100 : 0,
            }))
        );
    }
}