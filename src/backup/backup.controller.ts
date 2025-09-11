import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { BackupService } from './backup.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('backup')
@UseGuards(AuthGuard('jwt'))
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  /** Create a new backup immediately */
  @Post('create')
  async createBackup() {
    const fileName = await this.backupService.createBackup();
    return { message: `Backup created: ${fileName}`, fileName };
  }

  /** Restore a backup by fileName */
  @Post('restore')
  async restore(@Body() body: { fileName: string }) {
    const { fileName } = body;
    return await this.backupService.restoreBackup(fileName);
  }

  /** List all available backups */
  @Get('list')
  async listBackups() {
    const backups = this.backupService.listBackups();
    return { backups };
  }
}
