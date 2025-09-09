import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InvestorsService } from './investors.service';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('investors')
@UseGuards(AuthGuard('jwt'))
export class InvestorsController {
  constructor(private readonly investorsService: InvestorsService) { }

  @Post()
  async addInvestor(
    @Req() req,
    @Body('fullName') fullName: string,
    @Body('phone') phone: string,
    @Body('createdAt') createdAt: Date,
    @Body('amount') amount: number,
  ) {
    return this.investorsService.addInvestor(req.user.id,
      fullName,
      phone,
      amount,
      createdAt,
    );
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importInvestors(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.investorsService.importInvestorsFromExcel(req.user.id, file.buffer);
  }

  @Put(':id')
  async updateInvestor(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('fullName') fullName?: string,
    @Body('amount') amount?: number,
    @Body('phone') phone?: string,
    @Body('createdAt') createdAt?: Date,
  ) {
    return this.investorsService.updateInvestor(req.user.id, id, {
      fullName,
      amount,
      phone,
      createdAt,
    });
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
    @Query('fullName') fullName?: string,
    @Query('minAmount') minAmount?: number,
    @Query('maxAmount') maxAmount?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('minShare') minShare?: number,
    @Query('maxShare') maxShare?: number,
    @Query('email') email?: string,
  ) {
    return this.investorsService.getInvestors(req.user.id, page, {
      limit: limit ? Number(limit) : undefined,
      fullName,
      email,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
      startDate,
      endDate,
      minShare: minShare ? Number(minShare) : undefined,
      maxShare: maxShare ? Number(maxShare) : undefined,
    });
  }
}