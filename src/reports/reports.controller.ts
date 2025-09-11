import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  /** 1️⃣ Investors report */
  @Get('investors')
  async getInvestorsReport(
    @Req() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getInvestorsReport(
      req.user.id,
      req.user.role, // pass full user object
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /** 2️⃣ Individual investor report */
  @Get('investors/:id/:periodName')
  async getInvestorByIdAndYear(
    @Req() req,
    @Param('id') id: string,
    @Param('periodName') periodName: string,
  ) {
    return this.reportsService.getInvestorById(req.user.id, req.user.role, Number(id), periodName);
  }

  /** 2️⃣ Individual investor report */
  @Get('investors/:id')
  async getInvestorById(
    @Req() req,
    @Param('id') id: string,
  ) {
    return this.reportsService.getInvestorById(req.user.id, req.user.role, Number(id));
  }

  /** 3️⃣ Transactions report */
  @Get('transactions')
  async getTransactionsReport(
    @Req() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('periodName') periodName?: string,
  ) {
    return this.reportsService.getTransactionsReport(
      req.user.id,
      req.user.role,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      periodName,
    );
  }

  /** 4️⃣ Financial year report */
  @Get('financial-years/:periodName')
  async getFinancialYearReport(@Req() req, @Param('periodName') periodName: string) {
    return this.reportsService.getFinancialYearReport(req.user.id, req.user.role, periodName);
  }
}