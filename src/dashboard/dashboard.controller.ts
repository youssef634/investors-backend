import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    // 1️⃣ Overview stats
    @Get('overview')
    async getOverview(@Req() req) {
        return this.dashboardService.getOverview(req.user.id);
    }

    // 2️⃣ Aggregated amounts/profits by period
    @Get('aggregates')
    async getAggregates(@Req() req, @Query('period') period: 'week' | 'month' | 'year') {
        return this.dashboardService.getAggregates(period, req.user.id);
    }

    // 3️⃣ Transactions in a date range (deposit + withdraws)
    @Get('transactions-range')
    async getTransactionsInRange(
        @Req() req,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
    ) {
        return this.dashboardService.getTransactionsInRange(req.user.id, new Date(startDate), new Date(endDate));
    }

    // 4️⃣ Financial year summary by year
    @Get('financial-years')
    async getFinancialYearsSummary(@Query('count') count?: string) {
        const yearsCount = count ? parseInt(count, 10) : 1;
        return this.dashboardService.getFinancialYearsSummary(yearsCount);
    }

    @Get('top-investors')
    async getTopInvestors(@Query('limit') limit?: string) {
        const topInvestors = await this.dashboardService.getTopInvestors(
            limit ? Number(limit) : 5,
        );
        return { topInvestors };
    }
}