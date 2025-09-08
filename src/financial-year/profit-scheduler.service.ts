import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FinancialYearService } from './financial-year.service';
import { Role } from '@prisma/client';

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

  // Run every 24 hours at midnight
  @Cron('0 0 * * *')
  async handleDailyAccrualAndApproval() {
    this.logger.log('📅 Running daily accrual & auto-approval...');

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
            this.logger.log(`🎉 Approved and finalized year ${year.id} (daysAccrued=${daysAccrued}/${year.totalDays})`);
          } catch (err) {
            this.logger.error(`❌ Failed to approve year ${year.id}`, err);
          }
        }
      }
    }
  }
}