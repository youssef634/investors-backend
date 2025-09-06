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
  const s = dateOnly(start);
  const e = dateOnly(end);
  const ms = e.getTime() - s.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return days;
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

  /** Create a new financial year (with rollover settings) */
  async createFinancialYear(userId: number, data: any) {
    if (!data?.startDate || !data?.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }
    if (!data?.totalProfit) {
      throw new BadRequestException('totalProfit is required');
    }

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (end < start) throw new BadRequestException('endDate must be after startDate');

    let settings = await this.prisma.settings.findFirst();
    if (!settings) throw new BadRequestException('Settings not found');

    const rolloverEnabled = Boolean(data?.rolloverEnabled ?? false);
    const rolloverPct = rolloverEnabled ? Number(data?.rolloverPercentage ?? 100) : 0;

    const totalDays = diffDaysInclusive(start, end);

    // Create year first
    const year = await this.prisma.financialYear.create({
      data: {
        ...data,
        year: start.getFullYear(),
        periodName: data.periodName ?? `${start.getFullYear()}`,
        startDate: start,
        endDate: end,
        totalDays,
        totalProfit: data.totalProfit,
        rolloverEnabled,
        rolloverPercentage: rolloverPct,
        currency: settings.defaultCurrency,
        createdById: userId,
        status: 'draft',
      },
    });

    // Immediately distribute
    await this.distributeProfits(userId, Role.ADMIN, year.id);

    return year;
  }

  /** Update a financial year */
  async updateFinancialYear(
    adminId: number,
    role: Role,
    yearId: number,
    updates: {
      year?: number;
      periodName?: string;
      totalProfit?: number;
      startDate?: string;
      endDate?: string;
    },
  ) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can update financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    if (['approved', 'closed'].includes(year.status)) {
      throw new BadRequestException('Cannot update an approved or closed year');
    }

    const data: any = {};

    if (updates.year !== undefined) data.year = updates.year;
    if (updates.periodName !== undefined) data.periodName = updates.periodName;
    if (updates.totalProfit !== undefined) data.totalProfit = updates.totalProfit;

    // Handle start/end date & recalc totalDays
    if (updates.startDate || updates.endDate) {
      const start = updates.startDate ? new Date(updates.startDate) : year.startDate;
      const end = updates.endDate ? new Date(updates.endDate) : year.endDate;

      if (end < start) {
        throw new BadRequestException('endDate must be after startDate');
      }

      data.startDate = start;
      data.endDate = end;
      data.totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }

    const updated = await this.prisma.financialYear.update({
      where: { id: yearId },
      data,
    });

    // Re-distribute if totalProfit was updated
    if (updates.totalProfit !== undefined) {
      await this.distributeProfits(adminId, role, yearId);
    }
    return updated;
  }

  /** Distribute profits (calculation) — skips years that haven't started yet */
  async distributeProfits(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can distribute profits');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    const investors = await this.prisma.investors.findMany({ where: { amount: { gt: 0 } } });
    if (!investors.length) throw new BadRequestException('No investors found');

    const totalAmount = investors.reduce((s, inv) => s + inv.amount, 0);
    if (totalAmount <= 0) throw new BadRequestException('Total invested amount must be greater than 0');

    const results = await this.prisma.$transaction(async (tx) => {
      const upserted: any[] = [];

      for (const inv of investors) {
        const percentage = (inv.amount / totalAmount) * 100;
        const profitShare = (year.totalProfit * percentage) / 100;

        const rec = await tx.yearlyProfitDistribution.upsert({
          where: {
            financialYearId_investorId: {
              financialYearId: yearId,
              investorId: inv.id,
            },
          },
          update: { amount: inv.amount, percentage, dailyProfit: profitShare, updatedAt: new Date() },
          create: { financialYearId: yearId, investorId: inv.id, amount: inv.amount, percentage, dailyProfit: profitShare },
        });

        upserted.push(rec);
      }

      await tx.financialYear.update({
        where: { id: yearId },
        data: { status: 'calculated', updatedAt: new Date() },
      });

      return upserted;
    });

    return { financialYearId: yearId, status: 'calculated', results };
  }

  /** Get distributions of a year */
  async getDistributions(yearId: number, userId: number) {
    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: yearId },
      include: {
        investors: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { percentage: 'desc' },
    });

    const formattedDistributions = await Promise.all(
      distributions.map(async (d) => ({
        ...d,
        createdAt: await this.formatDate(d.createdAt, userId),
        updatedAt: await this.formatDate(d.updatedAt, userId),
        distributedAt: await this.formatDate(d.distributedAt, userId),
      }))
    );

    const totalInvestors = formattedDistributions.length;
    const totalDailyProfit = formattedDistributions.reduce(
      (s, d) => s + (d.dailyProfit ?? 0),
      0,
    );
    const averageDailyProfit =
      totalInvestors > 0 ? totalDailyProfit / totalInvestors : 0;

    return {
      financialYearId: yearId,
      status: year.status,
      distributions: formattedDistributions,
      summary: {
        totalInvestors,
        totalDailyProfit,
        dailyProfitRate: year.dailyProfitRate,
        averageDailyProfit,
        totalDays: year.totalDays,
        daysSoFar: diffDaysInclusive(year.startDate, new Date()),
        createdAt: await this.formatDate(year.createdAt, userId),
        updatedAt: await this.formatDate(year.updatedAt, userId),
        approvedAt: await this.formatDate(year.approvedAt, userId),
        distributedAt: await this.formatDate(year.distributedAt, userId),
      },
    };
  }

  /** Get all financial years (pagination + filters) */
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
        updatedAt: await this.formatDate(y.updatedAt, userId),
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

  /** Get single financial year */
  async getFinancialYearById(id: number, userId: number) {
    const year = await this.prisma.financialYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException('Financial year not found');

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: id },
      include: {
        investors: {
          select: {
            id: true,
            fullName: true,
            email: true,
            createdAt: true
          },
        },
      },
      orderBy: { amount: 'desc' },
    });

    const totalInvestors = distributions.length;
    const totalDailyProfit = distributions.reduce((s, d) => s + (d.dailyProfit ?? 0), 0);
    const averageDailyProfit = totalInvestors > 0 ? totalDailyProfit / totalInvestors : 0;

    return {
      year: {
        ...year,
        createdAt: await this.formatDate(year.createdAt, userId),
        updatedAt: await this.formatDate(year.updatedAt, userId),
        approvedAt: await this.formatDate(year.approvedAt, userId),
        distributedAt: await this.formatDate(year.distributedAt, userId),
      },
      distributions: await Promise.all(
        distributions.map(async (d) => ({
          ...d,
          createdAt: await this.formatDate(d.createdAt, userId),
          updatedAt: await this.formatDate(d.updatedAt, userId),
          distributedAt: await this.formatDate(d.distributedAt, userId),
        }))
      ),
      summary: {
        totalInvestors,
        totalDailyProfit,
        averageDailyProfit,
        dailyProfitRate: year.dailyProfitRate,
        daysSoFar: Math.max(0, diffDaysInclusive(year.startDate, new Date())),
      },
    };
  }

  /** Approve year (credit balances) */
  async approveYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can approve financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');
    if (year.status !== 'calculated') {
      throw new BadRequestException("Year must be 'calculated' before approval");
    }

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: yearId },
    });

    if (!distributions.length) throw new BadRequestException('No distributions found');

    const currency = year.currency;

    await this.prisma.$transaction(async (tx) => {
      for (const dist of distributions) {
        const profitAmount = dist.dailyProfit ?? 0;

        await tx.transaction.create({
          data: {
            investorId: dist.investorId,
            type: 'profit',
            amount: profitAmount,
            currency,
            date: new Date(),
          },
        });

        await tx.investors.update({
          where: { id: dist.investorId },
          data: { amount: { increment: profitAmount } },
        });
      }

      await tx.financialYear.update({
        where: { id: yearId },
        data: { status: 'approved', approvedById: adminId, approvedAt: new Date() },
      });
    });

    return { financialYearId: yearId, status: 'approved' };
  }

  /** Delete financial year (after closed) */
  async deleteFinancialYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can delete financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');
    if (year.status !== 'closed') {
      throw new BadRequestException(
        "Only 'closed' years can be deleted. Close the year first.",
      );
    }

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: yearId },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.yearlyProfitDistribution.deleteMany({
        where: { financialYearId: yearId },
      });

      // Delete only profit ledger entries created by approval
      for (const dist of distributions) {
        await tx.transaction.deleteMany({
          where: {
            investorId: dist.investorId,
            type: { in: ['profit'] },
          },
        });
      }

      await tx.financialYear.delete({ where: { id: yearId } });
    });

    return {
      message: `Financial year ${yearId} and its related records deleted successfully`,
      deletedId: yearId,
    };
  }

  /** Close year */
  async closeYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can close financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');
    if (year.status !== 'approved') {
      throw new BadRequestException(
        "Only 'approved' years can be closed. Approve the year first.",
      );
    }

    return this.prisma.financialYear.update({
      where: { id: yearId },
      data: { status: 'closed' },
    });
  }

  /** Admin-only: update rollover settings (only until approval) */
  async updateRolloverSettings(
    adminId: number,
    role: Role,
    yearId: number,
    payload: { rolloverEnabled?: boolean; rolloverPercentage?: number; autoRollover?: boolean; autoRolloverDate?: string | null }
  ) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can update rollover settings');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    // Don’t allow changing rollover settings after approval or close
    if (['approved', 'distributed', 'closed'].includes(year.status)) {
      throw new BadRequestException('Cannot change rollover after the year is approved/distributed/closed');
    }

    const updates: any = {};

    if (payload.rolloverEnabled !== undefined) {
      updates.rolloverEnabled = Boolean(payload.rolloverEnabled);
      // if enabling and no percentage stored, keep existing or default to 100
      if (updates.rolloverEnabled && year.rolloverPercentage == null && payload.rolloverPercentage == null) {
        updates.rolloverPercentage = 100;
      }
    }

    if (payload.rolloverPercentage !== undefined) {
      const pct = Number(payload.rolloverPercentage);
      if (pct < 0 || pct > 100) throw new BadRequestException('rolloverPercentage must be between 0 and 100');
      updates.rolloverPercentage = pct;
    }

    if (payload.autoRollover !== undefined) {
      updates.autoRollover = Boolean(payload.autoRollover);
    }

    if (payload.autoRolloverDate !== undefined) {
      updates.autoRolloverDate = payload.autoRolloverDate ? new Date(payload.autoRolloverDate) : null;
      updates.autoRolloverStatus = 'pending';
    }

    const updated = await this.prisma.financialYear.update({
      where: { id: yearId },
      data: updates,
    });

    return updated;
  }

  /** Apply auto rollover after approval */
  async applyAutoRollover(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can apply rollover');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');
    if (!year.autoRollover) throw new BadRequestException('Auto rollover is not enabled for this year');
    if (year.autoRolloverStatus === 'completed') {
      throw new BadRequestException('Auto rollover already applied');
    }
    if (year.status !== 'approved') {
      throw new BadRequestException("Year must be approved before rollover");
    }

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: yearId },
    });

    const rolloverPct = year.rolloverPercentage ?? 100;
    const currency = year.currency;

    await this.prisma.$transaction(async (tx) => {
      for (const dist of distributions) {
        const profitToCredit = dist.dailyProfit ?? 0;
        const rolloverAmount = (profitToCredit * rolloverPct) / 100;

        if (rolloverAmount > 0) {
          await tx.investors.update({
            where: { id: dist.investorId },
            data: {
              amount: { increment: rolloverAmount },
            },
          });

          await tx.transaction.create({
            data: {
              investorId: dist.investorId,
              type: 'rollover profit',
              amount: rolloverAmount,
              currency,
              date: new Date(),
            },
          });
        }
      }

      await tx.financialYear.update({
        where: { id: yearId },
        data: { autoRolloverStatus: 'completed', distributedAt: new Date() },
      });
    });

    return { financialYearId: yearId, rolloverApplied: true };
  }
}