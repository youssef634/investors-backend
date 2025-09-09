import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FinancialYearService } from './financial-year.service';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
import { ProfitSchedulerService } from './profit-scheduler.service';

@Controller('financial-years')
@UseGuards(AuthGuard('jwt'))
export class FinancialYearController {
  constructor(private financialYearService: FinancialYearService , 
              private profitSchedulerService: ProfitSchedulerService
  ) { }

  /** Create */
  @Post()
  async createFinancialYear(@Req() req, @Body() data: any) {
    return this.financialYearService.createFinancialYear(req.user.id, data);
  }

  /** Test accrual with fake date */
  @Get('simulate-accrual')
  async simulateAccrual(@Query('date') date?: string) {
    const fakeNow = date ? new Date(date) : undefined;
    return this.financialYearService.accrueDailyProfits(fakeNow);
  }

  @Get('test')
  async handleDailyAccrualAndApproval() {
    return this.profitSchedulerService.handleDailyAccrualAndApproval();
  }

  /** Update */
  @Put(':id')
  async updateFinancialYear(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      periodName?: string;
    },
  ) {
    return this.financialYearService.updateFinancialYear(
      req.user.id,
      req.user.role as Role,
      id,
      body,
    );
  }

  /** View distributions */
  @Get(':id/distributions')
  async getDistributions(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialYearService.getDistributions(id, req.user.id);
  }

  /** List with pagination & filters */
  @Get('all/:page')
  async getFinancialYears(
    @Param('page', ParseIntPipe) page: number,
    @Req() req,
    @Query('limit') limit?: number,
    @Query('year') year?: number,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.financialYearService.getFinancialYears(
      req.user.id,
      page,
      {
        limit: limit ? Number(limit) : undefined,
        year: year ? Number(year) : undefined,
        status: status || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
    );
  }

  /** Get one */
  @Get(':id')
  async getFinancialYear(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialYearService.getFinancialYearById(id, req.user.id);
  }

  /** Approve (credit balances by dailyProfit + create transactions) */
  @Patch(':id/approve')
  async approveYear(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialYearService.approveYear(
      req.user.id,
      req.user.role as Role,
      id,
    );
  }

  /** Delete */
  @Delete(':id')
  async deleteFinancialYear(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.financialYearService.deleteFinancialYear(req.user.id, req.user.role, id);
  }
}