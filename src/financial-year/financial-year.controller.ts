import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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

  /** List with pagination & filters */
  @Get()
  async getFinancialYears(
    @Req() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('year') year?: number,
    @Query('status') status?: string,
  ) {
    return this.financialYearService.getFinancialYears(
      req.user.id,
      Number(page),
      Number(limit),
      {
        year: year ? Number(year) : undefined,
        status: status || undefined,
      },
    );
  }

  /** Get one */
  @Get(':id')
  async getFinancialYear(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialYearService.getFinancialYearById(id, req.user.id);
  }

  /** Distribute (calculate & store per-investor records) */
  @Patch(':id/distribute')
  async distributeProfits(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialYearService.distributeProfits(
      req.user.id,
      req.user.role as Role,
      id,
    );
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

  /** Close */
  @Patch(':id/close')
  async closeYear(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.financialYearService.closeYear(
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

  /** Delete */
  @Delete(':id')
  async deleteFinancialYear(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.financialYearService.deleteFinancialYear(req.user.id, req.user.role, id);
  }
}