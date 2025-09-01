import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { InvestorsService } from './investors.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('investors')
@UseGuards(AuthGuard('jwt'))
export class InvestorsController {
    constructor(private readonly investorsService: InvestorsService) { }

    @Post()
    async addInvestor(
        @Req() req,
        @Body()
        body: { userName: string; phone: string; amount: number; },
    ) {
        return this.investorsService.addInvestor(req.user.id, body);
    }

    @Put(':id')
    async updateInvestor(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body()
        body: Partial<{ phone: string; amount: number; createdAt: Date }>,
    ) {
        return this.investorsService.updateInvestor(req.user.id, id, body);
    }

    @Delete(':id')
    async deleteInvestor(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.investorsService.deleteInvestor(req.user.id, id);
    }

    @Get(':page')
    async getInvestors(
        @Req() req,
        @Param('page') page: number,
        @Query('limit') limit?: number,
        @Query('id') id?: number,
        @Query('userName') userName?: string,
        @Query('phone') phone?: string,
        @Query('minAmount') minAmount?: number,
        @Query('maxAmount') maxAmount?: number,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('minShare') minShare?: number,
        @Query('maxShare') maxShare?: number,
    ) {
        return this.investorsService.getInvestors(req.user.id, Number(page), {
            limit: limit ? Number(limit) : undefined,
            id: id ? Number(id) : undefined,
            userName,
            phone,
            minAmount: minAmount ? Number(minAmount) : undefined,
            maxAmount: maxAmount ? Number(maxAmount) : undefined,
            startDate,
            endDate,
            minShare: minShare ? Number(minShare) : undefined,
            maxShare: maxShare ? Number(maxShare) : undefined,
        });
    }
}