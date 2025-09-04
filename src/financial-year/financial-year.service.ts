import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { Role } from '@prisma/client';

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

  /** Create a new financial year */
  async createFinancialYear(userId: number, data: any) {
    // Basic date validation
    if (!data?.startDate || !data?.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (end < start) {
      throw new BadRequestException('endDate must be after startDate');
    }

    // Resolve default currency from Settings
    let settings = await this.prisma.settings.findUnique({ where: { userId } });
    if (!settings) {
      settings = await this.prisma.settings.findFirst();
      if (!settings) throw new BadRequestException('Settings not found');
    }

    const totalDays = diffDaysInclusive(start, end);

    return this.prisma.financialYear.create({
      data: {
        ...data,
        currency: settings.defaultCurrency, // ⚠️ field is lowercase in your schema
        createdById: userId,
        totalDays,
        dailyProfitRate: null, // will be filled on distribute (calculation)
        status: 'draft',
      },
    });
  }

  /** Get all financial years (pagination + filters) */
  async getFinancialYears(
    _userId: number,
    page = 1,
    limit = 10,
    filters?: { year?: number; status?: string },
  ) {
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

    return {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      years,
    };
  }

  /** Get single year + summary basics */
  async getFinancialYearById(id: number) {
    const year = await this.prisma.financialYear.findUnique({
      where: { id },
    });
    if (!year) throw new NotFoundException('Financial year not found');

    const distributions = await this.prisma.yearlyProfitDistribution.findMany({
      where: { financialYearId: id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { amount: 'desc' },
    });

    const totalInvestors = distributions.length;
    const totalDailyProfit = distributions.reduce(
      (s, d) => s + (d.dailyProfit ?? 0),
      0,
    );
    const averageDailyProfit = totalInvestors > 0 ? totalDailyProfit / totalInvestors : 0;

    return {
      year,
      distributions,
      summary: {
        totalInvestors,
        totalDailyProfit,
        averageDailyProfit,
        dailyProfitRate: year.dailyProfitRate,
        daysSoFar: diffDaysInclusive(year.startDate, new Date()),
      },
    };
  }

  /**
   * DISTRIBUTE (CALCULATE) — Create/refresh distribution records with:
   *  - amount (investor principal)
   *  - percentage (share of fund)
   *  - daysSoFar
   *  - dailyProfit (amount * dailyRate * daysSoFar)
   * Sets year.status -> 'calculated'
   */
  async distributeProfits(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can distribute profits');
    }

    const year = await this.prisma.financialYear.findUnique({
      where: { id: yearId },
    });
    if (!year) throw new NotFoundException('Financial year not found');

    // Validate period
    const now = new Date();
    if (dateOnly(now) < dateOnly(year.startDate)) {
      throw new BadRequestException('Financial year has not started yet');
    }

    if (year.status === 'approved' || year.status === 'closed') {
      throw new BadRequestException(
        `Cannot (re)calculate distributions for a year with status '${year.status}'`,
      );
    }

    // Compute total days of the year
    const totalDays =
      year.totalDays && year.totalDays > 0
        ? year.totalDays
        : diffDaysInclusive(year.startDate, year.endDate);

    // Load investors
    const investors = await this.prisma.investors.findMany();
    if (!investors.length) {
      throw new BadRequestException('No investors found');
    }

    const totalAmount = investors.reduce((s, inv) => s + (inv.amount || 0), 0);
    if (totalAmount <= 0) {
      throw new BadRequestException('Total invested amount must be greater than 0');
    }

    // dailyRate = (totalProfit / totalAmount) / totalDays
    const dailyProfitRate =
      totalDays > 0 ? year.totalProfit / totalAmount / totalDays : 0;

    // Perform everything in one transaction
    const results = await this.prisma.$transaction(async (tx) => {
      await tx.yearlyProfitDistribution.deleteMany({
        where: { financialYearId: yearId },
      });

      const created = [];
      for (const inv of investors) {
        const percentage = (inv.amount / totalAmount) * 100;

        // Effective start date for this investor
        const effectiveStart =
          inv.createdAt > year.startDate ? inv.createdAt : year.startDate;

        const effectiveEnd = now > year.endDate ? year.endDate : now;
        const daysSoFar = Math.min(
          totalDays,
          diffDaysInclusive(effectiveStart, effectiveEnd),
        );

        const dailyProfit = inv.amount * dailyProfitRate * daysSoFar;

        const rec = await tx.yearlyProfitDistribution.create({
          data: {
            financialYearId: yearId,
            userId: inv.userId,
            amount: inv.amount,
            percentage,
            daysSoFar,
            dailyProfit,
          },
        });
        created.push(rec);
      }

      await tx.financialYear.update({
        where: { id: yearId },
        data: {
          totalDays,
          dailyProfitRate,
          status: 'calculated',
          updatedAt: new Date(),
        },
      });

      return created;
    });

    const totalInvestors = results.length;
    const totalDailyProfit = results.reduce((s, r) => s + (r.dailyProfit ?? 0), 0);

    const averageDailyProfit = totalInvestors > 0 ? totalDailyProfit / totalInvestors : 0;

    return {
      financialYearId: yearId,
      status: 'calculated',
      totalInvestors: results.length,
      totalDailyProfit,
      averageDailyProfit,
      dailyProfitRate,
      results,
    };
  }


  /**
   * APPROVE — Credit each investor’s balance by their calculated dailyProfit and
   * create a Transaction of type 'profit'; set year.status -> 'approved'
   */
  async approveYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can approve financial years');
    }

    const year = await this.prisma.financialYear.findUnique({
      where: { id: yearId },
    });
    if (!year) throw new NotFoundException('Financial year not found');

    if (year.status !== 'calculated') {
      throw new BadRequestException(
        "Year must be in 'calculated' status before approving",
      );
    }

    const distributions =
      await this.prisma.yearlyProfitDistribution.findMany({
        where: { financialYearId: yearId },
      });

    if (!distributions.length) {
      throw new BadRequestException(
        'No distributions exist for this financial year. Run distribute first.',
      );
    }

    const currency = year.currency;

    const { updatedCount, totalCredited } =
      await this.prisma.$transaction(async (tx) => {
        let total = 0;
        let count = 0;

        for (const dist of distributions) {
          const profitToCredit = dist.dailyProfit ?? 0;

          // Update investor balance
          await tx.investors.update({
            where: { userId: dist.userId },
            data: {
              amount: { increment: profitToCredit },
            },
          });

          // Create a profit transaction record (ledger)
          await tx.transaction.create({
            data: {
              userId: dist.userId,
              type: 'profit',
              amount: profitToCredit,
              currency, // from financial year
              date: new Date(),
            },
          });

          total += profitToCredit;
          count += 1;
        }

        // Mark year approved
        await tx.financialYear.update({
          where: { id: yearId },
          data: {
            status: 'approved',
            approvedById: adminId,
            approvedAt: new Date(),
          },
        });

        return { updatedCount: count, totalCredited: total };
      });

    return {
      financialYearId: yearId,
      status: 'approved',
      approvedCount: updatedCount,
      totalCredited,
      approvedAt: new Date(),
    };
  }

  /** CLOSE — Lock the year; no more calculations or approvals */
  async closeYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can close financial years');
    }

    const year = await this.prisma.financialYear.findUnique({
      where: { id: yearId },
    });
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

  /** Get distributions of a year (for Postman viewing) */
  async getDistributions(yearId: number) {
    const year = await this.prisma.financialYear.findUnique({
      where: { id: yearId },
    });
    if (!year) throw new NotFoundException('Financial year not found');

    const distributions =
      await this.prisma.yearlyProfitDistribution.findMany({
        where: { financialYearId: yearId },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { percentage: 'desc' },
      });

    const totalInvestors = distributions.length;
    const totalDailyProfit = distributions.reduce(
      (s, d) => s + (d.dailyProfit ?? 0),
      0,
    );
    const averageDailyProfit = totalInvestors > 0 ? totalDailyProfit / totalInvestors : 0;

    return {
      financialYearId: yearId,
      status: year.status,
      distributions,
      summary: {
        totalInvestors,
        totalDailyProfit,
        dailyProfitRate: year.dailyProfitRate,
        averageDailyProfit,
        totalDays: year.totalDays,
        daysSoFar: diffDaysInclusive(year.startDate, new Date()),
      },
    };
  }
}