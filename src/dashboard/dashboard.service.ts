import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear } from 'date-fns';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    /** 1️⃣ Overview stats */
    async getOverview() {
        const totalInvestors = await this.prisma.investors.count();
        const totalAmount = await this.prisma.investors.aggregate({
            _sum: { amount: true },
        });

        const totalProfit = await this.prisma.investors.aggregate({
            _sum: { profit: true },
        });

        const totalTransactions = await this.prisma.transaction.count();

        // Current month
        const now = new Date();
        const startThisMonth = startOfMonth(now);
        const endThisMonth = endOfMonth(now);

        const startLastMonth = startOfMonth(subMonths(now, 1));
        const endLastMonth = endOfMonth(subMonths(now, 1));

        const thisMonth = await this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { date: { gte: startThisMonth, lte: endThisMonth } },
        });

        const lastMonth = await this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { date: { gte: startLastMonth, lte: endLastMonth } },
        });

        const increasePercentage =
            lastMonth._sum.amount && lastMonth._sum.amount > 0
                ? ((thisMonth._sum.amount || 0) - (lastMonth._sum.amount || 0)) /
                (lastMonth._sum.amount || 1) *
                100
                : 100;

        return {
            totalInvestors,
            totalAmount: totalAmount._sum.amount || 0,
            totalProfit: totalProfit._sum.profit || 0,
            totalTransactions,
            monthlyIncreasePercentage: increasePercentage,
        };
    }

    /** 2️⃣ Aggregates by period */
    async getAggregates(
        period: 'week' | 'month' | 'year' = 'week' ,
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
            } else if (t.type === 'withdrawal' || t.type === 'withdraw_profit') {
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
                type: { in: ['deposit', 'withdraw_profit', 'withdrawal'] },
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
}