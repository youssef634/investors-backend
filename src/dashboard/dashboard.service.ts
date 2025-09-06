import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, subWeeks } from 'date-fns';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    /** 1️⃣ Overview stats */
    async getOverview() {
        // Current week (Sat → Fri)
        const now = new Date();
        const startThisWeek = startOfWeek(now, { weekStartsOn: 6 });
        const endThisWeek = endOfWeek(now, { weekStartsOn: 6 });

        // Last week
        const startLastWeek = startOfWeek(subWeeks(now, 1), { weekStartsOn: 6 });
        const endLastWeek = endOfWeek(subWeeks(now, 1), { weekStartsOn: 6 });

        // 1️⃣ Total investors (all-time)
        const totalInvestors = await this.prisma.investors.count();

        // Investors growth by week
        const thisWeekInvestors = await this.prisma.investors.count({
            where: { createdAt: { gte: startThisWeek, lte: endThisWeek } },
        });
        const lastWeekInvestors = await this.prisma.investors.count({
            where: { createdAt: { gte: startLastWeek, lte: endLastWeek } },
        });
        const investorsIncrease =
            lastWeekInvestors > 0
                ? ((thisWeekInvestors - lastWeekInvestors) / lastWeekInvestors) * 100
                : thisWeekInvestors > 0
                    ? 100
                    : 0;

        // 2️⃣ Total amount (all-time sum of investors.amount)
        const totalAmountAgg = await this.prisma.investors.aggregate({
            _sum: { amount: true },
        });
        const totalAmount = totalAmountAgg._sum.amount || 0;

        // Weekly amounts
        const thisWeekAmountAgg = await this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { date: { gte: startThisWeek, lte: endThisWeek }, type: 'deposit' },
        });
        const lastWeekAmountAgg = await this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { date: { gte: startLastWeek, lte: endLastWeek }, type: 'deposit' },
        });
        const amountIncrease =
            (lastWeekAmountAgg._sum.amount || 0) > 0
                ? ((thisWeekAmountAgg._sum.amount || 0) - (lastWeekAmountAgg._sum.amount || 0)) /
                (lastWeekAmountAgg._sum.amount || 1) *
                100
                : (thisWeekAmountAgg._sum.amount || 0) > 0
                    ? 100
                    : 0;

        // 3️⃣ Total profit (all-time sum from profit transactions)
        const totalProfitAgg = await this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { type: 'profit' },
        });
        const totalProfit = totalProfitAgg._sum.amount || 0;

        const thisWeekProfitAgg = await this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { date: { gte: startThisWeek, lte: endThisWeek }, type: 'profit' },
        });
        const lastWeekProfitAgg = await this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { date: { gte: startLastWeek, lte: endLastWeek }, type: 'profit' },
        });
        const profitIncrease =
            (lastWeekProfitAgg._sum.amount || 0) > 0
                ? ((thisWeekProfitAgg._sum.amount || 0) - (lastWeekProfitAgg._sum.amount || 0)) /
                (lastWeekProfitAgg._sum.amount || 1) *
                100
                : (thisWeekProfitAgg._sum.amount || 0) > 0
                    ? 100
                    : 0;

        // 4️⃣ Transactions count (all-time)
        const totalTransactions = await this.prisma.transaction.count();

        const thisWeekTransactions = await this.prisma.transaction.count({
            where: { date: { gte: startThisWeek, lte: endThisWeek } },
        });
        const lastWeekTransactions = await this.prisma.transaction.count({
            where: { date: { gte: startLastWeek, lte: endLastWeek } },
        });
        const transactionsIncrease =
            lastWeekTransactions > 0
                ? ((thisWeekTransactions - lastWeekTransactions) / lastWeekTransactions) * 100
                : thisWeekTransactions > 0
                    ? 100
                    : 0;

        return {
            totalInvestors,
            totalAmount,
            totalProfit,
            totalTransactions,
            weeklyIncreases: {
                investors: investorsIncrease,
                amount: amountIncrease,
                profit: profitIncrease,
                transactions: transactionsIncrease,
            },
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
        let totalProfits = 0;

        for (const t of transactions) {
            // Convert amount to default currency
            let convertedAmount = t.amount;
            if (t.currency === 'USD' && defaultCurrency === 'IQD') {
                convertedAmount = t.amount * USDtoIQD;
            } else if (t.currency === 'IQD' && defaultCurrency === 'USD') {
                convertedAmount = t.amount / USDtoIQD;
            }

            if (t.type === 'deposit') {
                totalDeposits += convertedAmount;
            } else if (t.type === 'withdrawal') {
                totalWithdrawals += convertedAmount;
            } else if (t.type === 'profit') {
                totalProfits += convertedAmount;
            }
        }

        const totalAmount = totalDeposits - totalWithdrawals;

        return {
            period,
            startDate: start,
            endDate: end,
            totalAmount,
            totalProfit: totalProfits,
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
        const diffToSaturday = (currentDay + 7 - 6) % 7; // how many days to go back to reach Saturday

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - diffToSaturday);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Saturday + 6 = Friday
        weekEnd.setHours(23, 59, 59, 999);

        // ✅ Parse inputs
        const start = startDate ? new Date(startDate) : weekStart;
        const end = endDate ? new Date(endDate) : weekEnd;

        // fallback if invalid
        if (isNaN(start.getTime())) start.setTime(weekStart.getTime());
        if (isNaN(end.getTime())) end.setTime(weekEnd.getTime());

        // Load settings
        let settings = await this.prisma.settings.findUnique({ where: { userId } });
        if (!settings) {
            settings = await this.prisma.settings.findFirst();
            if (!settings) throw new NotFoundException('Settings not found');
        }
        const { defaultCurrency, USDtoIQD } = settings;

        // Fetch transactions
        const transactions = await this.prisma.transaction.findMany({
            where: {
                date: { gte: start, lte: end },
                type: { in: ['deposit', 'withdrawal'] },
            },
            orderBy: { date: 'asc' },
        });

        // Group by day
        const grouped: Record<string, { deposits: number[]; withdraws: number[] }> = {};

        for (const tx of transactions) {
            const day = tx.date.toISOString().split('T')[0];
            if (!grouped[day]) grouped[day] = { deposits: [], withdraws: [] };

            let normalizedAmount = tx.amount;
            if (defaultCurrency === 'IQD' && tx.currency === 'USD') {
                normalizedAmount = tx.amount * USDtoIQD;
            } else if (defaultCurrency === 'USD' && tx.currency === 'IQD') {
                normalizedAmount = tx.amount / USDtoIQD;
            }

            if (tx.type === 'deposit') grouped[day].deposits.push(normalizedAmount);
            else grouped[day].withdraws.push(normalizedAmount);
        }

        // Response with averages
        const dailyAverages = Object.entries(grouped).map(([day, { deposits, withdraws }]) => ({
            day,
            averageDeposit: deposits.length ? deposits.reduce((a, b) => a + b, 0) / deposits.length : 0,
            averageWithdraw: withdraws.length ? withdraws.reduce((a, b) => a + b, 0) / withdraws.length : 0,
            //totalDeposit: deposits.reduce((a, b) => a + b, 0),
            //totalWithdraw: withdraws.reduce((a, b) => a + b, 0),
            currency: defaultCurrency,
        }));

        return {
            startDate: start,
            endDate: end,
            currency: defaultCurrency,
            days: dailyAverages,
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
            });
        }

        // Convert to array of objects
        return targetYears.map((year) => ({
            year,
            financialYears: grouped[year] || [],
        }));
    }

    /** 5️⃣ Top 5 investors by amount */
    async getTopInvestors(limit: number = 5) {
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
                email: true,
                amount: true,
                createdAt: true,
            },
        });

        return topInvestors.map(inv => ({
            investorId: inv.id,
            fullName: inv.fullName,
            email: inv.email,
            amount: inv.amount,
            joinedAt: inv.createdAt,
            percentageOfTotal: totalAmount > 0 ? (inv.amount / totalAmount) * 100 : 0,
        }));
    }
}