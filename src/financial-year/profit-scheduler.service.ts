import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FinancialYearService } from './financial-year.service';
import { Role } from '@prisma/client';

@Injectable()
export class ProfitSchedulerService {
  private readonly logger = new Logger(ProfitSchedulerService.name);

  constructor(private readonly fyService: FinancialYearService) { }

  @Cron('0 0 * * *')
  async handleHourlyProfitDistribution() {
    this.logger.log('Running hourly profit distribution...');

    const now = new Date();

    // Find financial years that are not closed
    const years = await this.fyService['prisma'].financialYear.findMany({
      where: {
        status: { in: ['calculated'] },
      },
    });

    for (const year of years) {
      if (now >= year.endDate) {
        if (year.status === 'calculated') {
          this.logger.log(`Approving year ${year.id} (end date reached)`);
          await this.fyService.approveYear(1, Role.ADMIN, year.id);
        }

        // ✅ Auto rollover check
        // if (
        //   year.autoRollover &&
        //   year.autoRolloverDate &&
        //   now >= year.autoRolloverDate &&
        //   year.autoRolloverStatus === 'pending' &&
        //   year.status === 'calculated'
        // ) {
        //   this.logger.log(`Applying auto rollover for year ${year.id}`);
        //   await this.fyService.applyAutoRollover(1, Role.ADMIN, year.id);
        // }
      }
    }
  }
}