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
            .toFormat('MMM dd, yyyy, hh:mm a');
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
                rollover_amount: true, // adjust if your column name is different
            },
        });

        const totalInvested = investorSums.amount ?? 0;
        const totalRollover = investorSums.rollover_amount ?? 0;
        const totalAmount = totalInvested - totalRollover;

        // 3️⃣ Total transactions count
        const totalTransactions = await this.prisma.transaction.count();

        return {
            totalInvestors,
            totalAmount,
            totalRollover,
            totalTransactions,
            currency: defaultCurrency,
        };
    }

    /** 2️⃣ Aggregates by period */
    async getAggregates(
        period: 'week' | 'month' | 'year' = 'week',
        userId?: number
    ) {
        const now = new Date();
        let start: Date, end: Date;

        switch (period) {
            case 'week': {
                // ✅ Week starts on Saturday, ends on Friday
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
        }

        // ✅ Get settings (for currency conversion)
        const settings = await this.prisma.settings.findUnique({
            where: { userId },
        });

        if (!settings) {
            throw new BadRequestException('User settings not found');
        }

        const { defaultCurrency, USDtoIQD } = settings;

        // ✅ Fetch all transactions in range
        const transactions = await this.prisma.transaction.findMany({
            where: { date: { gte: start, lte: end } },
            select: { type: true, amount: true, currency: true },
        });

        let totalDeposits = 0;
        let totalWithdrawals = 0;
        let totalRollover = 0;

        for (const t of transactions) {
            // Convert amount to default currency
            let convertedAmount = t.amount;
            if (t.currency === 'USD' && defaultCurrency === 'IQD') {
                convertedAmount = t.amount * USDtoIQD;
            } else if (t.currency === 'IQD' && defaultCurrency === 'USD') {
                convertedAmount = t.amount / USDtoIQD;
            }

            if (t.type === 'DEPOSIT') {
                totalDeposits += convertedAmount;
            } else if (t.type === 'WITHDRAWAL') {
                totalWithdrawals += convertedAmount;
            } else if (t.type === 'ROLLOVER') {
                totalRollover += convertedAmount;
            }
        }

        const totalAmount = totalDeposits - totalWithdrawals;
        const totalRollovers = totalRollover;

        return {
            period,
            startDate: start,
            endDate: end,
            totalAmount,
            totalRollover: totalRollovers,
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
                date: { gte: start, lte: end },
                type: { in: ['DEPOSIT', 'WITHDRAWAL', 'ROLLOVER'] },
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
            else if (tx.type === 'ROLLOVER') grouped[day].rollovers.push(normalizedAmount);
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
            _sum: { amount: true },
        });
        const totalAmount = totalAmountAgg._sum.amount || 0;

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