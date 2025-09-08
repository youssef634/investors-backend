import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FinancialYearService } from './financial-year.service';
import { Role } from '@prisma/client';

@Injectable()
export class ProfitSchedulerService {
  private readonly logger = new Logger(ProfitSchedulerService.name);

  constructor(private readonly fyService: FinancialYearService) { }

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
      } else if (new Date() > year.endDate) {
        // Nothing processed and the year is past its end → finalize
        try {
          await this.fyService.approveYear(1, Role.ADMIN, year.id);
          this.logger.log(`🎉 Approved and finalized year ${year.id}`);
        } catch (err) {
          this.logger.error(
            `❌ Failed to approve year ${year.id}}`,
          );
        }
      } else {
        this.logger.log(
          `⏭ No accrual today for year ${year.id}, still before end date.`,
        );
      }
    }
  }
}