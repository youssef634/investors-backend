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

/** Inclusive day difference (end - start) */
function diffDaysInclusive(start: Date, end: Date) {
  const s = dateOnly(start);
  const e = dateOnly(end);
  const ms = e.getTime() - s.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1; // inclusive
  return Math.max(0, days);
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

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (end < start) throw new BadRequestException('endDate must be after startDate');

    const settings = await this.prisma.settings.findFirst();
    if (!settings) throw new BadRequestException('Settings not found');

    const totalDays = diffDaysInclusive(start, end);
    const dailyProfit = totalDays > 0 ? Number(data.totalProfit) / totalDays : 0;

    // Always force rollover = 100%
    const year = await this.prisma.financialYear.create({
      data: {
        year: start.getFullYear(),
        periodName: data.periodName ?? `${start.getFullYear()}`,
        totalProfit: Number(data.totalProfit),
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

    return year;
  }

  //Update a financial year (admin only).
  async updateFinancialYear(
    adminId: number,
    role: Role,
    yearId: number,
    updates: {
      periodName?: string;
    },
  ) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can update financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    if (year.status === 'DISTRIBUTED') {
      throw new BadRequestException('Cannot update a distributed year');
    }

    const data: any = {};
    if (updates.periodName !== undefined) {
      data.periodName = updates.periodName;
    }

    const updated = await this.prisma.financialYear.update({
      where: { id: yearId },
      data,
    });

    return updated;
  }

  async accrueDailyProfits(fakeNow?: Date) {
    const now = fakeNow ?? new Date();

    // Pending years only
    const years = await this.prisma.financialYear.findMany({
      where: { status: 'PENDING' },
    });

    if (!years.length) return { processed: 0 };

    let processedYears = 0;

    for (const year of years) {
      const dailyProfitPerYear = Number(year.dailyProfit ?? 0);
      if (dailyProfitPerYear <= 0) continue;

      // --- figure out which day we need to process (UTC safe) ---
      let nextDay: Date;
      if (year.distributedAt) {
        nextDay = new Date(year.distributedAt);
        nextDay.setUTCHours(0, 0, 0, 0); // normalize to UTC midnight
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      } else {
        nextDay = new Date(year.startDate);
        nextDay.setUTCHours(0, 0, 0, 0); // first day midnight UTC
      }

      // stop if out of range
      if (nextDay > year.endDate || nextDay > now) continue;

      // end of current day (UTC)
      const dayEnd = new Date(nextDay);
      dayEnd.setUTCHours(23, 59, 59, 999);

      // --- investors who exist on this day ---
      const dailyInvestors = await this.prisma.investors.findMany({
        where: {
          amount: { gt: 0 },
          createdAt: { lte: dayEnd },
        },
      });

      if (!dailyInvestors.length) continue;

      const totalDailyAmount = dailyInvestors.reduce((s, i) => s + i.amount, 0);
      if (totalDailyAmount <= 0) continue;

      await this.prisma.$transaction(async (tx) => {
        for (const inv of dailyInvestors) {
          const invPct = inv.amount / totalDailyAmount;
          const invDailyShare = invPct * dailyProfitPerYear;

          // calculate days so far (from effective join date)
          const effectiveStart =
            inv.createdAt > year.startDate ? inv.createdAt : year.startDate;
          const daysSoFar = diffDaysInclusive(effectiveStart, dayEnd);

          const existing = await tx.yearlyProfitDistribution.findUnique({
            where: {
              financialYearId_investorId: {
                financialYearId: year.id,
                investorId: inv.id,
              },
            },
          });

          if (existing) {
            await tx.yearlyProfitDistribution.update({
              where: {
                financialYearId_investorId: {
                  financialYearId: year.id,
                  investorId: inv.id,
                },
              },
              data: {
                percentage: invPct * 100,
                dailyProfit: invDailyShare,
                totalProfit: { increment: invDailyShare }, // ⬅ one day only
                daysSoFar, // update days so far
              },
            });
          } else {
            await tx.yearlyProfitDistribution.create({
              data: {
                financialYearId: year.id,
                investorId: inv.id,
                amount: inv.amount,
                percentage: invPct * 100,
                dailyProfit: invDailyShare,
                totalProfit: invDailyShare, // first day only
                daysSoFar: 1, // first day
                isRollover: year.rolloverEnabled,
                createdAt: inv.createdAt,
              },
            });
          }
        }

        // ✅ mark that we’ve processed this day
        await tx.financialYear.update({
          where: { id: year.id },
          data: { distributedAt: dayEnd },
        });
      });

      processedYears++;
    }

    return { processed: processedYears, simulatedDate: now };
  }

  // Approve/Finalize the year and perform rollover transfers.
  async approveYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can approve financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    if (year.status === 'DISTRIBUTED') {
      throw new BadRequestException('Financial year already distributed');
    }

    // Get distributions for the year
    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: yearId },
    });

    if (!distributions.length) {
      throw new BadRequestException(
        'No distributions found for this financial year. Ensure accrual ran before approval.',
      );
    }

    // get settings for currency conversion
    const settings = await this.prisma.settings.findFirst();
    if (!settings) throw new NotFoundException('Admin settings not found');

    const currency = year.currency;

    await this.prisma.$transaction(async (tx) => {
      for (const dist of distributions) {
        const totalProfit = Number(dist.totalProfit ?? 0);
        if (totalProfit <= 0) continue;

        // amount in IQD (convert if needed)
        const amountInIQD =
          currency === 'USD' ? totalProfit * settings.USDtoIQD : totalProfit;

        // Create a ROLLOVER transaction linked to this financial year
        await tx.transaction.create({
          data: {
            investorId: dist.investorId,
            type: 'ROLLOVER',
            amount: totalProfit, // keep original amount in original currency
            currency,
            date: new Date(),
            financialYearId: year.id,
          },
        });

        // Move accumulated profit → investor balances (always in IQD)
        await tx.investors.update({
          where: { id: dist.investorId },
          data: {
            amount: { increment: amountInIQD },
            rollover_amount: { increment: amountInIQD },
          },
        });
      }

      // Mark year distributed
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
        totalInvestors: formatted.length,
        currency: year.currency,
        totalProfit: distributions.reduce((s, d) => s + (d.totalProfit ?? 0), 0),
        dailyProfit: year.dailyProfit,
        totalDays: year.totalDays,
        daysSoFar: Math.max(0, diffDaysInclusive(year.startDate, new Date())),
        createdAt: await this.formatDate(year.createdAt, userId),
        approvedAt: await this.formatDate(year.approvedAt ?? null, userId),
        distributedAt: await this.formatDate(year.distributedAt ?? null, userId),
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
        createdAt: await this.formatDate(year.createdAt, userId),
        approvedAt: await this.formatDate(year.approvedAt ?? null, userId),
        distributedAt: await this.formatDate(year.distributedAt ?? null, userId),
      },
      distributions: formattedDistributions,
      summary: {
        totalInvestors: formattedDistributions.length,
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
      // delete distributions
      await tx.yearlyProfitDistribution.deleteMany({ where: { financialYearId: yearId } });

      // delete rollover transactions that reference this financial year
      await tx.transaction.deleteMany({ where: { financialYearId: yearId } });

      // delete year
      await tx.financialYear.delete({ where: { id: yearId } });
    });

    return { message: `Financial year ${yearId} and its related records deleted successfully`, deletedId: yearId };
  }
}