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
      rolloverEnabled?: boolean;
      rolloverPercentage?: number;
    },
  ) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can update financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    if (['distributed'].includes(year.status)) {
      throw new BadRequestException('Cannot update a distributed year');
    }

    const data: any = {};

    // ✅ Basic updates
    if (updates.year !== undefined) data.year = updates.year;
    if (updates.periodName !== undefined) data.periodName = updates.periodName;
    if (updates.totalProfit !== undefined) data.totalProfit = updates.totalProfit;

    // ✅ Rollover updates
    if (updates.rolloverEnabled !== undefined) {
      data.rolloverEnabled = updates.rolloverEnabled;
      if (updates.rolloverEnabled) {
        // default to 100% if not provided
        data.rolloverPercentage = updates.rolloverPercentage ?? (year.rolloverPercentage ?? 100);
      } else {
        data.rolloverPercentage = 0; // disable rollover
      }
    } else if (updates.rolloverPercentage !== undefined) {
      if (updates.rolloverPercentage < 0 || updates.rolloverPercentage > 100) {
        throw new BadRequestException('Rollover percentage must be between 0 and 100');
      }
      data.rolloverPercentage = updates.rolloverPercentage;
    }

    // ✅ Dates
    if (updates.startDate || updates.endDate) {
      const start = updates.startDate ? new Date(updates.startDate) : year.startDate;
      const end = updates.endDate ? new Date(updates.endDate) : year.endDate;

      if (end < start) {
        throw new BadRequestException('endDate must be after startDate');
      }

      data.startDate = start;
      data.endDate = end;
      data.totalDays = Math.max(
        1,
        Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      );
    }

    // ✅ Save updates
    const updated = await this.prisma.financialYear.update({
      where: { id: yearId },
      data,
    });

    // ✅ Re-distribute only if profit was updated
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
          update: {
            amount: inv.amount,
            percentage,
            totalProfit: profitShare,
            isRollover: year.rolloverEnabled,
          },
          create: {
            financialYearId: yearId,
            investorId: inv.id,
            amount: inv.amount,
            percentage,
            totalProfit: profitShare,
            isRollover: year.rolloverEnabled,
            createdAt: inv.createdAt,
          },
        });

        upserted.push(rec);
      }

      await tx.financialYear.update({
        where: { id: yearId },
        data: { status: 'calculated', distributedAt: new Date() },
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
        investors: { select: { id: true, fullName: true, email: true, createdAt: true } },
      },
      orderBy: { percentage: 'desc' },
    });

    const formattedDistributions = await Promise.all(
      distributions.map(async (d) => ({
        ...d,
        createdAt: await this.formatDate(d.createdAt, userId),
        distributedAt: await this.formatDate(year.distributedAt, userId),
      }))
    );

    const totalInvestors = formattedDistributions.length;
    const totalDailyProfit = formattedDistributions.reduce(
      (s, d) => s + (d.totalProfit ?? 0),
      0,
    );
    const averageDailyProfit =
      totalInvestors > 0 ? totalDailyProfit / year.totalDays : 0;

    return {
      financialYearId: yearId,
      status: year.status,
      distributions: formattedDistributions,
      summary: {
        totalInvestors,
        totalDailyProfit,
        dailyProfit: averageDailyProfit,
        averageDailyProfit,
        totalDays: year.totalDays,
        daysSoFar: diffDaysInclusive(year.startDate, new Date()),
        createdAt: await this.formatDate(year.createdAt, userId),
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
    const totalProfit = distributions.reduce((s, d) => s + (d.totalProfit ?? 0), 0);
    const averageDailyProfit = totalInvestors > 0 ? totalProfit / year.totalDays : 0;

    return {
      year: {
        ...year,
        createdAt: await this.formatDate(year.createdAt, userId),
        approvedAt: await this.formatDate(year.approvedAt, userId),
        distributedAt: await this.formatDate(year.distributedAt, userId),
      },
      distributions: await Promise.all(
        distributions.map(async (d) => ({
          ...d,
          createdAt: await this.formatDate(d.createdAt, userId),
          distributedAt: await this.formatDate(year.distributedAt, userId),
        }))
      ),
      summary: {
        totalInvestors,
        totalProfit,
        dailyProfit: averageDailyProfit,
        daysSoFar: Math.max(0, diffDaysInclusive(year.startDate, new Date())),
      },
    };
  }

  /** Approve year (credit balances per investor with isRollover flag) */
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
        const totalProfit = dist.totalProfit ?? 0;

        if (dist.isRollover) {
          // ✅ Split into profit + rollover
          const rolloverPct = year.rolloverEnabled ? year.rolloverPercentage ?? 100 : 0;
          const payoutPct = 100 - rolloverPct;

          const payoutProfit = (totalProfit * payoutPct) / 100;
          const rolloverProfit = (totalProfit * rolloverPct) / 100;

          if (payoutProfit > 0) {
            await tx.investors.update({
              where: { id: dist.investorId },
              data: { profit: { increment: payoutProfit } },
            });

            await tx.transaction.create({
              data: {
                investorId: dist.investorId,
                type: 'profit',
                amount: payoutProfit,
                currency,
                date: new Date(),
              },
            });
          }

          if (rolloverProfit > 0) {
            await tx.investors.update({
              where: { id: dist.investorId },
              data: { amount: { increment: rolloverProfit } },
            });

            await tx.transaction.create({
              data: {
                investorId: dist.investorId,
                type: 'rollover',
                amount: rolloverProfit,
                currency,
                date: new Date(),
              },
            });
          }
        } else {
          // ❌ No rollover → all goes to profit balance
          await tx.investors.update({
            where: { id: dist.investorId },
            data: { profit: { increment: totalProfit } },
          });

          await tx.transaction.create({
            data: {
              investorId: dist.investorId,
              type: 'profit',
              amount: totalProfit,
              currency,
              date: new Date(),
            },
          });
        }
      }

      await tx.financialYear.update({
        where: { id: yearId },
        data: {
          status: 'distributed',
          approvedById: adminId,
          approvedAt: new Date(),
        },
      });
    });

    return { financialYearId: yearId, status: 'distributed' };
  }

  /** Delete financial year (after closed) */
  async deleteFinancialYear(adminId: number, role: Role, yearId: number) {
    if (role !== Role.ADMIN) throw new ForbiddenException('Only admin can delete financial years');

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

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

  /** toggle isRollover for a specific investor in a given year */
  async toggleInvestorRollover(
    adminId: number,
    role: Role,
    yearId: number,
    investorId: number,
  ) {
    if (role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can update rollover settings');
    }

    const year = await this.prisma.financialYear.findUnique({ where: { id: yearId } });
    if (!year) throw new NotFoundException('Financial year not found');

    const distribution = await this.prisma.yearlyProfitDistribution.findUnique({
      where: {
        financialYearId_investorId: { financialYearId: yearId, investorId },
      },
    });

    if (!distribution) {
      throw new NotFoundException('Investor distribution not found for this financial year');
    }

    if (!year.rolloverEnabled) {
      throw new BadRequestException('Rollover is not enabled for this financial year');
    }

    // Toggle the current value
    const updated = await this.prisma.yearlyProfitDistribution.update({
      where: {
        financialYearId_investorId: { financialYearId: yearId, investorId },
      },
      data: { isRollover: !distribution.isRollover },
    });

    return {
      message: `Rollover toggled for investor ${investorId} in year ${yearId}`,
      distribution: updated,
    };
  }
}