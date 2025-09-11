import { Module } from '@nestjs/common';
import { FinancialYearService } from './financial-year.service';
import { FinancialYearController } from './financial-year.controller';
import { PrismaService } from '../prisma/prisma.service/prisma.service';

@Module({
  controllers: [FinancialYearController],
  providers: [FinancialYearService, PrismaService],
  exports: [FinancialYearService],
})
export class FinancialYearModule {}
