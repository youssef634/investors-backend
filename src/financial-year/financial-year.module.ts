import { Module } from '@nestjs/common';
import { FinancialYearService } from './financial-year.service';
import { FinancialYearController } from './financial-year.controller';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { ProfitSchedulerService } from './profit-scheduler.service';

@Module({
  controllers: [FinancialYearController],
  providers: [FinancialYearService, ProfitSchedulerService, PrismaService],
  exports: [FinancialYearService],
})
export class FinancialYearModule {}
