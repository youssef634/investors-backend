import { Module } from '@nestjs/common';
import { InvestorsService } from './investors.service';
import { InvestorsController } from './investors.controller';
import { PrismaService } from '../prisma/prisma.service/prisma.service';

@Module({
  controllers: [InvestorsController],
  providers: [InvestorsService, PrismaService],
})
export class InvestorsModule {}
