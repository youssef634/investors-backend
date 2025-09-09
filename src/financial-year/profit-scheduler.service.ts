import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FinancialYearService } from './financial-year.service';
import { Role } from '@prisma/client';
import { DateTime } from 'luxon';

function dateOnly(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function diffDaysInclusive(start: Date, end: Date) {
  const s = dateOnly(start);
  const e = dateOnly(end);
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

@Injectable()
export class ProfitSchedulerService {
  private readonly logger = new Logger(ProfitSchedulerService.name);

  constructor(private readonly fyService: FinancialYearService) {}

  // Run every hour → check if it's midnight in user's timezone
  @Cron('0 * * * *') // every hour
  async handleDailyAccrualAndApproval() {
    this.logger.log('📅 Checking if it’s midnight in local timezone...');

    // Get settings to know which timezone to use
    const settings = await this.fyService['prisma'].settings.findFirst();
    const timezone = settings?.timezone || 'UTC';

    const now = DateTime.utc().setZone(timezone);

    // ✅ Only run when it's midnight in local timezone
    if (now.hour !== 0) {
      return; // skip until local midnight
    }

    this.logger.log(`🕛 Local midnight reached in timezone ${timezone}`);

    // Find all years still pending
    const years = await this.fyService['prisma'].financialYear.findMany({
      where: { status: 'PENDING' },
    });

    for (const year of years) {
      // Try to accrue one more day
      const result = await this.fyService.accrueDailyProfits();

      if (result.processed > 0) {
        this.logger.log(
          `✅ Accrued daily profit for year ${year.id} (simulatedDate=${result.simulatedDate})`,
        );
      }

      // --- Check if this year is fully accrued ---
      if (year.distributedAt) {
        const daysAccrued = diffDaysInclusive(year.startDate, year.distributedAt);
        if (daysAccrued >= year.totalDays) {
          try {
            await this.fyService.approveYear(1, Role.ADMIN, year.id);
            this.logger.log(
              `🎉 Approved and finalized year ${year.id} (daysAccrued=${daysAccrued}/${year.totalDays})`,
            );
          } catch (err) {
            this.logger.error(`❌ Failed to approve year ${year.id}`, err);
          }
        }
      }
    }
  }
}