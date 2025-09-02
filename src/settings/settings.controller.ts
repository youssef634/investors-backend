import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('settings')
@UseGuards(AuthGuard('jwt'))
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(@Req() req) {
    return this.settingsService.getSettings(req.user.id);
  }

  @Patch()
  async updateSettings(@Req() req, @Body() body: any) {
    return this.settingsService.updateSettings(req.user.id, body, req.user.role);
  }
}
