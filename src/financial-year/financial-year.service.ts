import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { Role } from '@prisma/client';
import { DateTime } from 'luxon';

function dateOnly(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function diffDaysInclusive(start: Date, end: Date) {
  const s = dateOnly(start); // → strips to 00:00
  const e = dateOnly(end);   // → strips to 00:00
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

@Injectable()
export class FinancialYearService {
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

  //Create a financial year.
  async createFinancialYear(userId: number, data: any) {
    if (!data?.startDate || !data?.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }
    if (data.totalProfit === undefined || data.totalProfit === null) {
      throw new BadRequestException('totalProfit is required');
    }

    // Get settings for timezone + currency
    const settings = await this.prisma.settings.findFirst();
    if (!settings) throw new BadRequestException('Settings not found');
    const tz = settings.timezone || 'UTC';

    // Snap start and end to local day boundaries, then convert to UTC before saving
    const start = DateTime.fromISO(data.startDate, { zone: 'utc' })
      .setZone(tz)
      .startOf('day')
      .toUTC()
      .toJSDate();

    const end = DateTime.fromISO(data.endDate, { zone: 'utc' })
      .setZone(tz)
      .startOf('day')  // ✅ change here, no more endOf('day')
      .toUTC()
      .toJSDate();



    if (end < start) throw new BadRequestException('endDate must be after startDate');

    const totalDays = diffDaysInclusive(start, end);
    const totalProfit = Number(String(data.totalProfit).replace(/,/g, ''));
    const dailyProfit = totalDays > 0 ? totalProfit / totalDays : 0;

    // Always force rollover = 100%
    const year = await this.prisma.financialYear.create({
      data: {
        year: data.year,
        periodName: data.periodName ?? `${DateTime.fromJSDate(start).year}`,
        totalProfit: totalProfit,
        startDate: start,
        endDate: end,
        totalDays,
        dailyProfit,
        rolloverEnabled: true,
        rolloverPercentage: 100,
        currency: settings.defaultCurrency,
        createdById: userId,
      },
    });
    await this.finalizeYearlyProfits(year.id);

    return year;
  }

  //Update a financial year (admin only).
  async updateFinancialYear(
    adminId: number,
    role: Role,
    yearId: number,
    updates: { periodName?: string; startDate?: string; endDate?: string; year?: number },
  ) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can update financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    if (year.status === 'DISTRIBUTED') {
      throw new BadRequestException('Cannot update a distributed year');
    }

    const data: any = {};

    if (updates.periodName !== undefined) data.periodName = updates.periodName;
    if (updates.year !== undefined) data.year = updates.year;

    let recalcDistributions = false;

    if (updates.startDate || updates.endDate) {
      const settings = await this.prisma.settings.findFirst();
      if (!settings) throw new BadRequestException('Settings not found');
      const tz = settings.timezone || 'UTC';

      const start = DateTime.fromISO(updates.startDate, { zone: 'utc' })
        .setZone(tz)
        .startOf('day')
        .toUTC()
        .toJSDate();

      const end = DateTime.fromISO(updates.endDate, { zone: 'utc' })
        .setZone(tz)
        .startOf('day')
        .toUTC()
        .toJSDate();


      if (end < start) throw new BadRequestException('endDate must be after startDate');

      const totalDays = diffDaysInclusive(start, end);
      const dailyProfit = totalDays > 0 ? Number(year.totalProfit) / totalDays : 0;

      Object.assign(data, { startDate: start, endDate: end, totalDays, dailyProfit });
      recalcDistributions = true;
    }

    const updated = await this.prisma.financialYear.update({ where: { id: yearId }, data });

    // 🔄 reset distributions if date range changed
    if (recalcDistributions) {
      await this.prisma.yearlyProfitDistribution.deleteMany({ where: { financialYearId: yearId } });
      await this.finalizeYearlyProfits(yearId); // regenerate in one shot
    }

    return updated;
  }

  async finalizeYearlyProfits(yearId: number) {
    const year = await this.prisma.financialYear.findUnique({
      where: { id: yearId },
    });
    if (!year) throw new NotFoundException('Financial year not found');

    if (year.status !== 'PENDING') {
      throw new BadRequestException('Year already finalized or distributed');
    }

    const settings = await this.prisma.settings.findFirst();
    if (!settings) throw new NotFoundException('Settings not found');
    const tz = settings.timezone || 'UTC';

    const totalProfit = Number(year.totalProfit ?? 0);
    const totalDays = Number(year.totalDays ?? 0);
    if (totalProfit <= 0 || totalDays <= 0) {
      throw new BadRequestException('Invalid financial year data');
    }

    // Investors active at the *end of the year*
    const lastDayUtc = DateTime.fromJSDate(year.endDate)
      .setZone(tz)
      .endOf('day')
      .toUTC()
      .toJSDate();

    const investors = await this.prisma.investors.findMany({
      where: { amount: { gt: 0 }, createdAt: { lte: lastDayUtc } },
    });

    if (!investors.length) {
      throw new BadRequestException('No active investors found for this year');
    }

    // Precompute totals
    const totalAmount = investors.reduce((s, i) => s + i.amount, 0);

    // Build distribution rows in memory
    const distributions = investors.map((inv) => {
      const invStart = DateTime.fromJSDate(inv.createdAt).setZone(tz).startOf('day');
      const yearStart = DateTime.fromJSDate(year.startDate).setZone(tz).startOf('day');
      const yearEnd = DateTime.fromJSDate(year.endDate).setZone(tz).startOf('day');

      const effectiveStart = invStart > yearStart ? invStart : yearStart;
      let daysActive = Math.floor(yearEnd.diff(effectiveStart, 'days').days) + 1;
      if (daysActive < 0) daysActive = 0;

      const percentage = inv.amount / totalAmount;
      const finalProfit = totalProfit * percentage; // full share based on capital
      const dailyProfit = daysActive > 0 ? finalProfit / daysActive : 0;

      return {
        financialYearId: year.id,
        investorId: inv.id,
        amount: inv.amount,
        percentage: percentage * 100,
        totalProfit: finalProfit,
        dailyProfit,
        daysSoFar: daysActive,
        isRollover: year.rolloverEnabled,
        createdAt: inv.createdAt,
      };
    });

    await this.prisma.$transaction(
      async (tx) => {
        // wipe old distributions
        await tx.yearlyProfitDistribution.deleteMany({
          where: { financialYearId: year.id },
        });

        // insert all rows in one shot 🚀
        await tx.yearlyProfitDistribution.createMany({
          data: distributions,
        });

        // update year metadata
        await tx.financialYear.update({
          where: { id: year.id },
          data: { distributedAt: lastDayUtc },
        });
      },
      { timeout: 60000 }, // allow up to 60s for big batches
    );

    return {
      financialYearId: year.id,
      status: 'PENDING',
      processedInvestors: investors.length,
      totalDistributed: distributions.reduce((s, d) => s + d.totalProfit, 0),
      totalProfit,
    };
  }

  // Approve/Finalize the year and perform rollover transfers.
  async approveYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can approve financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    if (year.status === 'DISTRIBUTED') {
      throw new BadRequestException('Financial year already distributed');
    }

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: yearId },
    });

    if (!distributions.length) {
      throw new BadRequestException(
        'No distributions found for this financial year. Ensure accrual ran before approval.',
      );
    }

    const settings = await this.prisma.settings.findFirst();
    if (!settings) throw new NotFoundException('Admin settings not found');

    await this.prisma.$transaction(async (tx) => {
      for (const dist of distributions) {
        const totalProfit = Number(dist.totalProfit ?? 0);
        if (totalProfit <= 0) continue;

        // ✅ Save transaction in original year currency
        await tx.transaction.create({
          data: {
            investorId: dist.investorId,
            type: 'PROFIT',
            amount: totalProfit,
            currency: year.currency, // keep original currency
            date: new Date(),
            financialYearId: year.id,
            status: 'PENDING',
          },
        });

        // ✅ Convert profit to USD for balances
        let profitInUSD: number;
        if (year.currency === 'USD') {
          profitInUSD = totalProfit;
        } else if (year.currency === 'IQD') {
          profitInUSD = totalProfit / settings.USDtoIQD;
        } else {
          throw new BadRequestException(`Unsupported currency: ${year.currency}`);
        }

        // ✅ Update investor balances in USD
        await tx.investors.update({
          where: { id: dist.investorId },
          data: {
            total_amount: { increment: profitInUSD },
            rollover_amount: { increment: profitInUSD },
          },
        });
      }

      await tx.financialYear.update({
        where: { id: yearId },
        data: {
          status: 'DISTRIBUTED',
          approvedById: adminId,
          approvedAt: new Date(),
          distributedAt: new Date(),
        },
      });
    });

    return { financialYearId: yearId, status: 'DISTRIBUTED' };
  }

  // Get distributions for a year with timezone-formatted dates (userId is used to read timezone)
  async getDistributions(yearId: number, userId: number) {
    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: yearId },
      include: {
        investors: { select: { id: true, fullName: true, phone: true, createdAt: true, amount: true, rollover_amount: true } },
      },
      orderBy: { percentage: 'desc' },
    });
    const investors = await this.prisma.investors.findMany({
      where: { amount: { gt: 0 }, createdAt: { lte: year.endDate } },
    });

    let total = 0;
    if (year.status === 'DISTRIBUTED') {
      total = distributions.length;
    } else {
      total = investors.length;
    }

    const formatted = await Promise.all(distributions.map(async (d) => ({
      id: d.id,
      financialYearId: d.financialYearId,
      investorId: d.investorId,
      amount: d.amount,
      percentage: d.percentage,
      currency: year.currency,
      dailyProfit: d.dailyProfit,
      totalProfit: d.totalProfit,
      daysSoFar: d.daysSoFar,
      createdAt: await this.formatDate(d.createdAt, userId),
      investor: {
        id: d.investors.id,
        fullName: d.investors.fullName,
        phone: d.investors.phone,
        amount: d.investors.amount,
        rollover_amount: d.investors.rollover_amount,
        createdAt: await this.formatDate(d.investors.createdAt, userId),
      },
    })));

    return {
      financialYearId: yearId,
      status: year.status,
      distributions: formatted,
      summary: {
        totalInvestors: total,
        currency: year.currency,
        totalDistributed: Number(year.totalProfit ?? 0),
        totalProfit: distributions.reduce((s, d) => s + (d.totalProfit ?? 0), 0),
        dailyProfit: year.dailyProfit,
        totalDays: year.totalDays,
        createdAt: await this.formatDate(year.createdAt, userId),
        approvedAt: await this.formatDate(year.approvedAt ?? null, userId),
      },
    };
  }

  // Get single financial year (for display) with formatted dates
  async getFinancialYearById(id: number, userId: number) {
    const year = await this.prisma.financialYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException('Financial year not found');

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: id },
      include: {
        investors: { select: { id: true, fullName: true, phone: true, createdAt: true, amount: true, rollover_amount: true } },
      },
      orderBy: { percentage: 'desc' },
    });

    const investors = await this.prisma.investors.findMany();

    const formattedDistributions = await Promise.all(distributions.map(async (d) => ({
      id: d.id,
      investorId: d.investorId,
      amount: d.amount,
      percentage: d.percentage,
      currency: year.currency,
      dailyProfit: d.dailyProfit,
      totalProfit: d.totalProfit,
      createdAt: await this.formatDate(d.createdAt, userId),
      investor: {
        id: d.investors.id,
        fullName: d.investors.fullName,
        phone: d.investors.phone,
        amount: d.investors.amount,
        rollover_amount: d.investors.rollover_amount,
        createdAt: await this.formatDate(d.investors.createdAt, userId),
      },
    })));

    return {
      year: {
        ...year,
        startDate: await this.formatDate(year.startDate, userId),
        endDate: await this.formatDate(year.endDate, userId),
        createdAt: await this.formatDate(year.createdAt, userId),
        approvedAt: await this.formatDate(year.approvedAt ?? null, userId),
        distributedAt: await this.formatDate(year.distributedAt ?? null, userId),
      },
      distributions: formattedDistributions,
      summary: {
        totalInvestors: investors.length,
        totalDistributed: Number(year.totalProfit ?? 0),
        totalProfit: distributions.reduce((s, d) => s + (d.totalProfit ?? 0), 0),
        currency: year.currency,
        dailyProfit: year.dailyProfit,
        daysSoFar: Math.max(0, diffDaysInclusive(year.startDate, new Date())),
      },
    };
  }

  // Get all financial years (pagination + filters)
  async getFinancialYears(
    userId: number,
    page = 1,
    filters?: {
      limit?: number;
      year?: number;
      status?: string;
      startDate?: string;
      endDate?: string;
    }
  ) {
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.year) where.year = filters.year;
    if (filters?.status) where.status = filters.status;

    // ✅ filter based on the financial year's own startDate field
    if (filters?.startDate || filters?.endDate) {
      where.startDate = {};
      if (filters.startDate) {
        where.startDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.startDate.lte = new Date(filters.endDate);
      }
    }

    const total = await this.prisma.financialYear.count({ where });
    const years = await this.prisma.financialYear.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }, // keep newest first
    });

    const formattedYears = await Promise.all(
      years.map(async (y) => ({
        ...y,
        startDate: await this.formatDate(y.startDate, userId),
        endDate: await this.formatDate(y.endDate, userId),
        createdAt: await this.formatDate(y.createdAt, userId),
        approvedAt: await this.formatDate(y.approvedAt, userId),
        distributedAt: await this.formatDate(y.distributedAt, userId),
      }))
    );

    return {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      years: formattedYears,
    };
  }

  // Delete financial year and its distributions / related rollover transactions.
  async deleteFinancialYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can delete financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({ where: { financialYearId: yearId } });

    await this.prisma.$transaction(async (tx) => {
      // If distributed → cancel transactions before deleting
      if (year.status === 'DISTRIBUTED') {
        const transactions = await tx.transaction.findMany({ where: { financialYearId: yearId } });
        for (const t of transactions) {
          if (t.status !== 'CANCELED') {
            // reuse cancelTransaction logic
            await this.cancelTransactionInternal(tx, t.id);
          }
        }
      }

      // delete distributions
      await tx.yearlyProfitDistribution.deleteMany({ where: { financialYearId: yearId } });

      // delete year
      await tx.financialYear.delete({ where: { id: yearId } });
    });

    return { message: `Financial year ${yearId} and its related records deleted successfully`, deletedId: yearId };
  }

  /** Internal cancel logic (same as TransactionsService.cancelTransaction but scoped to prismaTx) */
  private async cancelTransactionInternal(prismaTx: any, id: number) {
    const tx = await prismaTx.transaction.findUnique({ where: { id } });
    if (!tx || tx.status === 'CANCELED') return;

    const investor = await prismaTx.investors.findUnique({ where: { id: tx.investorId } });
    if (!investor) return;

    const settings = await prismaTx.settings.findFirst();
    if (!settings) return;

    let amountInUSD = tx.currency === 'USD' ? tx.amount : tx.amount / settings.USDtoIQD;

    let updatedAmount = investor.amount;
    let updatedRollover = investor.rollover_amount;
    let updatedTotal = investor.total_amount;

    if (tx.type === 'DEPOSIT') {
      updatedAmount -= amountInUSD;
      updatedTotal -= amountInUSD;
    } else if (tx.type === 'WITHDRAWAL') {
      updatedTotal += amountInUSD;
      if (tx.withdrawSource === 'ROLLOVER') {
        updatedRollover += amountInUSD;
      } else if (tx.withdrawSource === 'AMOUNT') {
        const mainAmountPart = tx.withdrawFromAmount || 0;
        const rolloverPart = amountInUSD - mainAmountPart;
        updatedAmount += mainAmountPart;
        updatedRollover += rolloverPart;
      }
    } else if (tx.type === 'PROFIT') {
      updatedRollover -= amountInUSD;
      updatedTotal -= amountInUSD;
    }

    if (updatedAmount < 0 || updatedRollover < 0 || updatedTotal < 0) return;

    await prismaTx.investors.update({
      where: { id: tx.investorId },
      data: {
        amount: updatedAmount,
        rollover_amount: updatedRollover,
        total_amount: updatedTotal,
      },
    });

    await prismaTx.transaction.update({
      where: { id },
      data: { status: 'CANCELED' },
    });
  }
}