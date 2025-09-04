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

    return DateTime
      .fromJSDate(date, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('MMM dd, yyyy, hh:mm a');
  }

  /** Create a new financial year */
  async createFinancialYear(userId: number, data: any) {
    if (!data?.startDate || !data?.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (end < start) {
      throw new BadRequestException('endDate must be after startDate');
    }

    let settings = await this.prisma.settings.findUnique({ where: { userId } });
    if (!settings) {
      settings = await this.prisma.settings.findFirst();
      if (!settings) throw new BadRequestException('Settings not found');
    }

    const totalDays = diffDaysInclusive(start, end);

    return this.prisma.financialYear.create({
      data: {
        ...data,
        currency: settings.defaultCurrency,
        createdById: userId,
        totalDays,
        dailyProfitRate: null,
        status: 'draft',
      },
    });
  }

  /** Get all financial years (pagination + filters) */
  async getFinancialYears(userId: number, page = 1, limit = 10, filters?: { year?: number; status?: string }) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (filters?.year) where.year = filters.year;
    if (filters?.status) where.status = filters.status;

    const total = await this.prisma.financialYear.count({ where });
    const years = await this.prisma.financialYear.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
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
    const year = await this.prisma.financialYear.findUnique({
      where: { id },
    });
    if (!year) throw new NotFoundException('Financial year not found');

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            investors: { select: { createdAt: true } },
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

  /** Distribute profits (calculation) */
  async distributeProfits(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can distribute profits');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    const now = new Date();
    if (dateOnly(now) < dateOnly(year.startDate)) {
      throw new BadRequestException('Financial year has not started yet');
    }
    if (year.status === 'approved' || year.status === 'closed') {
      throw new BadRequestException(`Cannot (re)calculate distributions for a year with status '${year.status}'`);
    }

    const totalDays = year.totalDays || diffDaysInclusive(year.startDate, year.endDate);
    const investors = await this.prisma.investors.findMany();
    if (!investors.length) throw new BadRequestException('No investors found');

    const totalAmount = investors.reduce((s, inv) => s + (inv.amount || 0), 0);
    if (totalAmount <= 0) throw new BadRequestException('Total invested amount must be greater than 0');

    const dailyProfitRate = totalDays > 0 ? year.totalProfit / totalAmount / totalDays : 0;

    const results = await this.prisma.$transaction(async (tx) => {
      const upserted: any[] = [];
      for (const inv of investors) {
        const percentage = (inv.amount / totalAmount) * 100;
        const effectiveStart = inv.createdAt > year.startDate ? inv.createdAt : year.startDate;
        const effectiveEnd = now > year.endDate ? year.endDate : now;
        const daysSoFar = Math.min(totalDays, diffDaysInclusive(effectiveStart, effectiveEnd));
        const dailyProfit = inv.amount * dailyProfitRate * daysSoFar;

        const rec = await tx.yearlyProfitDistribution.upsert({
          where: { financialYearId_userId: { financialYearId: yearId, userId: inv.userId } },
          update: { amount: inv.amount, percentage, daysSoFar, dailyProfit,createdAt: inv.createdAt, updatedAt: new Date() },
          create: { financialYearId: yearId, userId: inv.userId, amount: inv.amount, percentage, daysSoFar, dailyProfit },
        });

        upserted.push(rec);
      }

      await tx.financialYear.update({
        where: { id: yearId },
        data: { totalDays, dailyProfitRate, status: 'calculated', updatedAt: new Date() },
      });

      return upserted;
    });

    const totalInvestors = results.length;
    const totalDailyProfit = results.reduce((s, r) => s + (r.dailyProfit ?? 0), 0);
    const averageDailyProfit = totalInvestors > 0 ? totalDailyProfit / totalInvestors : 0;

    return {
      financialYearId: yearId,
      status: 'calculated',
      totalInvestors,
      totalDailyProfit,
      averageDailyProfit,
      dailyProfitRate,
      results,
    };
  }

  /** Approve year (credit balances + transactions) */
  async approveYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can approve financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');
    if (year.status !== 'calculated') {
      throw new BadRequestException("Year must be in 'calculated' status before approving");
    }

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({ where: { financialYearId: yearId } });
    if (!distributions.length) throw new BadRequestException('No distributions exist for this financial year. Run distribute first.');

    const currency = year.currency;
    const { updatedCount, totalCredited } = await this.prisma.$transaction(async (tx) => {
      let total = 0, count = 0;
      for (const dist of distributions) {
        const profitToCredit = dist.dailyProfit ?? 0;
        await tx.investors.update({ where: { userId: dist.userId }, data: { amount: { increment: profitToCredit } } });
        await tx.transaction.create({ data: { userId: dist.userId, type: 'profit', amount: profitToCredit, currency, date: new Date() } });
        total += profitToCredit; count++;
      }
      await tx.financialYear.update({ where: { id: yearId }, data: { status: 'approved', approvedById: adminId, approvedAt: new Date() } });
      return { updatedCount: count, totalCredited: total };
    });

    return { financialYearId: yearId, status: 'approved', approvedCount: updatedCount, totalCredited, approvedAt: new Date() };
  }

  /** Close year */
  async closeYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can close financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');
    if (year.status !== 'approved') throw new BadRequestException("Only 'approved' years can be closed. Approve the year first.");

    return this.prisma.financialYear.update({ where: { id: yearId }, data: { status: 'closed' } });
  }

  /** Get distributions of a year */
  async getDistributions(yearId: number, userId: number) {
    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: yearId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
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
    const totalDailyProfit = formattedDistributions.reduce((s, d) => s + (d.dailyProfit ?? 0), 0);
    const averageDailyProfit = totalInvestors > 0 ? totalDailyProfit / totalInvestors : 0;

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

  /** Delete financial year (after closed) */
  async deleteFinancialYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can delete financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');
    if (year.status !== 'closed') throw new BadRequestException("Only 'closed' years can be deleted. Close the year first.");

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({ where: { financialYearId: yearId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.yearlyProfitDistribution.deleteMany({ where: { financialYearId: yearId } });
      for (const dist of distributions) {
        await tx.transaction.deleteMany({ where: { userId: dist.userId, type: 'profit' } });
      }
      await tx.financialYear.delete({ where: { id: yearId } });
    });

    return { message: `Financial year ${yearId} and its related records deleted successfully`, deletedId: yearId };
  }
}