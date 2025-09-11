import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateTransactionDto, GetTransactionsDto } from './dto/transactions.dto';

@Controller('transactions')
@UseGuards(AuthGuard('jwt'))
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) { }

  @Post()
  async addTransaction(@Req() req, @Body() dto: CreateTransactionDto) {
    return this.transactionsService.addTransaction(req.user.id, dto);
  }

  // DELETE single transaction by URL param
  @Delete(':id')
  async deleteTransaction(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.transactionsService.deleteTransactions(req.user.id, id);
  }

  // DELETE multiple transactions by body
  @Delete()
  async deleteManyTransactions(
    @Req() req,
    @Body('ids') ids: number[],
  ) {
    return this.transactionsService.deleteTransactions(req.user.id, ids);
  }

  @Patch(':id/cancel')
  async cancelTransaction(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.transactionsService.cancelTransaction(req.user.id, id);
  }

  @Get(':page')
  async getTransactions(
    @Req() req,
    @Param('page', ParseIntPipe) page: number,
    @Query() query: GetTransactionsDto
  ) {
    return this.transactionsService.getTransactions(req.user.id, page, query);
  }
}