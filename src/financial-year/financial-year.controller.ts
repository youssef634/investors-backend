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

@Controller('financial-years')
@UseGuards(AuthGuard('jwt'))
export class FinancialYearController {
  constructor(private financialYearService: FinancialYearService) { }

  /** Create */
  @Post()
  async createFinancialYear(@Req() req, @Body() data: any) {
    return this.financialYearService.createFinancialYear(req.user.id, data);
  }

  /** Update */
  @Put(':id')
  async updateFinancialYear(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      year?: number;
      periodName?: string;
      totalProfit?: number;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.financialYearService.updateFinancialYear(
      req.user.id,
      req.user.role as Role,
      id,
      body,
    );
  }

  /** Distribute (calculate) */
  @Patch(':id/distribute')
  async distributeProfits(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialYearService.distributeProfits(
      req.user.id,
      req.user.role as Role,
      id,
    );
  }

  /** View distributions */
  @Get(':id/distributions')
  async getDistributions(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialYearService.getDistributions(id, req.user.id);
  }

  /** List with pagination & filters */
  @Get(':page')
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

  /** Close */
  @Patch(':id/close')
  async closeYear(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialYearService.closeYear(
      req.user.id,
      req.user.role as Role,
      id,
    );
  }

  @Patch(':id/rollover')
  async updateRollover(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      rolloverEnabled?: boolean;
      rolloverPercentage?: number;
      autoRollover?: boolean;
      autoRolloverDate?: string | null;
    },
    @Req() req: any,
  ) {
    return this.financialYearService.updateRolloverSettings(
      req.user.id,
      req.user.role,
      id,
      body,
    );
  }

  @Post(':id/rollover')
  async applyRollover(@Param('id') id: number, @Req() req: any) {
    const adminId = req.user.id;
    const role = req.user.role as Role;

    return this.financialYearService.applyAutoRollover(adminId, role, Number(id));
  }
}