import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateTransactionDto, GetTransactionsDto } from './dto/transactions.dto';

@Controller('transactions')
@UseGuards(AuthGuard('jwt'))
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  async addTransaction(@Req() req, @Body() dto: CreateTransactionDto) {
    return this.transactionsService.addTransaction(req.user.id, dto);
  }

  @Delete(':id')
  async deleteTransaction(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.deleteTransaction(req.user.id, id);
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