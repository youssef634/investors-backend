import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FinancialYearService } from './financial-year.service';
import { Role } from '@prisma/client';

@Injectable()
export class ProfitSchedulerService {
  private readonly logger = new Logger(ProfitSchedulerService.name);

  constructor(private readonly fyService: FinancialYearService) {}

  /**
   * Runs every midnight (server time):
   *  1. Accrues daily profits for all active financial years.
   *  2. Closes any years that have reached their end date (auto-approve).
   */
  // @Cron('* * * * *')
  // async handleDailyProfitTasks() {
  //   this.logger.log('Running daily profit scheduler...');

  //   // Step 1️⃣: Accrue today's profits for all active years
  //   const accrualResult = await this.fyService.accrueDailyProfits();
  //   this.logger.log(`Accrued profits for ${accrualResult.processed} financial years.`);

  //   // Step 2️⃣: Close and approve financial years whose end date has passed
  //   const now = new Date();
  //   const years = await this.fyService['prisma'].financialYear.findMany({
  //     where: { status: 'PENDING' },
  //   });

  //   for (const year of years) {
  //     if (now >= year.endDate) {
  //       this.logger.log(`Approving financial year ${year.id} (end date reached).`);
  //       await this.fyService.approveYear(1, Role.ADMIN, year.id);
  //     }
  //   }
  // }
}