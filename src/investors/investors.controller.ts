import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { InvestorsService } from './investors.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('investors')
@UseGuards(AuthGuard('jwt'))
export class InvestorsController {
    constructor(private readonly investorsService: InvestorsService) {}

    @Post(':id')
    async addInvestor(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body('amount') amount: number,
    ) {
        return this.investorsService.addInvestor(req.user.id, id, amount);
    }

    @Put(':id')
    async updateInvestor(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body('amount') amount: number,
    ) {
        return this.investorsService.updateInvestor(req.user.id, id, amount);
    }

    @Delete(':id')
    async deleteInvestor(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.investorsService.deleteInvestor(req.user.id, id);
    }

    @Get(':page')
    async getInvestors(
        @Req() req,
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
        @Query('userId') userId?: number,
        @Query('search') search?: any,
        @Query('minAmount') minAmount?: number,
        @Query('maxAmount') maxAmount?: number,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('minShare') minShare?: number,
        @Query('maxShare') maxShare?: number,
    ) {
        return this.investorsService.getInvestors(req.user.id, page, {
            limit: limit ? Number(limit) : undefined,
            userId: userId ? Number(userId) : undefined,
            minAmount: minAmount ? Number(minAmount) : undefined,
            maxAmount: maxAmount ? Number(maxAmount) : undefined,
            search,
            startDate,
            endDate,
            minShare: minShare ? Number(minShare) : undefined,
            maxShare: maxShare ? Number(maxShare) : undefined,
        });
    }
}