import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FinancialYearService } from './financial-year.service';
import { Role } from '@prisma/client';

@Injectable()
export class ProfitSchedulerService {
  private readonly logger = new Logger(ProfitSchedulerService.name);

  constructor(private readonly fyService: FinancialYearService) {}

  /**
   * Runs every 1 hour at minute 0
   * Cron pattern: second minute hour day month weekday
   * Here: 0 * * * * → every hour
   */
  @Cron('0 * * * *')
  async handleHourlyProfitDistribution() {
    this.logger.log('Running hourly profit distribution...');

    try {
      const now = new Date();

      // Find financial years that are not closed
      const years = await this.fyService['prisma'].financialYear.findMany({
        where: {
          status: { in: ['draft', 'calculated', 'approved'] },
        },
      });

      for (const year of years) {
        if (year.status === 'draft' || year.status === 'calculated') {
          this.logger.log(`Distributing profits for year ${year.id}`);
          await this.fyService.distributeProfits(
            1, // system/admin
            Role.ADMIN,
            year.id,
          );
        }

        // If the financial year has ended, approve & close it
        if (now >= year.endDate) {
          if (year.status === 'calculated') {
            this.logger.log(`Approving year ${year.id} (end date reached)`);
            await this.fyService.approveYear(1, Role.ADMIN, year.id);
          }

          if (year.status === 'approved') {
            this.logger.log(`Closing year ${year.id} (end date reached)`);
            await this.fyService.closeYear(1, Role.ADMIN, year.id);
          }
        }
      }

      this.logger.log('Hourly profit distribution completed ✅');
    } catch (err) {
      this.logger.error('Failed to run profit distribution', err);
    }
  }
}