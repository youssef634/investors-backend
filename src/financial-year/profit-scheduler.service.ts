import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FinancialYearService } from './financial-year.service';
import { Role } from '@prisma/client';

@Injectable()
export class ProfitSchedulerService {
  private readonly logger = new Logger(ProfitSchedulerService.name);

  constructor(private readonly fyService: FinancialYearService) {}

  /**
   * Runs once every 24 hours at midnight
   * Cron pattern: second minute hour day month weekday
   * Here: 0 0 0 * * * → 00:00:00 every day
   */
  @Cron('0 0 0 * * *')
  async handleDailyProfitDistribution() {
    this.logger.log('Running daily profit distribution...');

    try {
      // Load all open financial years that are not closed
      // You can adjust filters as needed (e.g., status = draft | calculated)
      const years = await this.fyService['prisma'].financialYear.findMany({
        where: { status: { in: ['calculated'] } },
      });

      for (const year of years) {
        this.logger.log(`Distributing profits for year ${year.id}`);
        await this.fyService.distributeProfits(
          1, // adminId (system/admin account)
          Role.ADMIN,
          year.id,
        );
      }

      this.logger.log('Daily profit distribution completed ✅');
    } catch (err) {
      this.logger.error('Failed to run profit distribution', err);
    }
  }
}