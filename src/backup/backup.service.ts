import { Injectable, OnModuleInit, BadRequestException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment-timezone';

@Injectable()
export class BackupService implements OnModuleInit {
  private prisma = new PrismaClient();
  private backupDir = path.join(process.cwd(), 'backups');
  private readonly logger = new Logger(BackupService.name);

  constructor() {
    if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir);
  }

  /** Run on server start */
  async onModuleInit() {
    await this.checkAndCreateStartupBackup();
  }

  /** Cron: every 5 minutes, but backup only runs at 2 PM */
  @Cron('*/5 * * * *')
  async handleCron() {
    await this.tryRunBackup();
  }

  /** Check on startup if today's backup exists */
  private async checkAndCreateStartupBackup() {
    const timezone = await this.getTimezone();
    const now = moment().tz(timezone);
    const fileName = `backup-${now.format('YYYY-MM-DD')}.sql`;
    const filePath = path.join(this.backupDir, fileName);

    if (!fs.existsSync(filePath)) {
      this.logger.log('⚡ No backup for today found. Creating now...');
      await this.createBackup();
    }
  }

  /** Try running the backup at 2 PM in the configured timezone */
  private async tryRunBackup() {
    const timezone = await this.getTimezone();
    const now = moment().tz(timezone);
    if (now.hour() === 14 && now.minute() === 0) {
      await this.createBackup();
    }
  }

  /** Get timezone from settings or default UTC */
  private async getTimezone(): Promise<string> {
    const settings = await this.prisma.settings.findFirst();
    return settings?.timezone || 'UTC';
  }

  /** Create backup */
  public async createBackup(): Promise<string> {
    this.logger.log('📦 Creating backup...');

    const tables: { tablename: string }[] = await this.prisma.$queryRaw`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    const now = moment().format('YYYY-MM-DD');
    const fileName = `backup-${now}.sql`;
    const filePath = path.join(this.backupDir, fileName);
    const writeStream = fs.createWriteStream(filePath);

    for (const table of tables) {
      if (table.tablename === '_prisma_migrations') continue; // skip migrations

      const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "${table.tablename}"`);
      for (const row of rows) {
        const columns = Object.keys(row).map(c => `"${c}"`).join(',');
        const values = Object.values(row).map(v => {
          if (v === null || v === undefined) return 'NULL';
          if (v instanceof Date) return `'${moment(v).toISOString()}'`;
          if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
          return v;
        }).join(',');

        writeStream.write(`INSERT INTO "${table.tablename}" (${columns}) VALUES (${values});\n`);
      }
    }

    writeStream.end();
    this.logger.log(`✅ Backup created: ${fileName}`);
    return fileName;
  }

  /** Restore backup safely (Option 2: single user) */
  public async restoreBackup(fileName: string): Promise<string> {
    const filePath = path.join(this.backupDir, fileName);
    if (!fs.existsSync(filePath)) throw new BadRequestException('Backup file not found');

    const sql = fs.readFileSync(filePath, 'utf-8');

    // Split statements and clean
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => !s.startsWith('--'));

    // Sort tables by foreign key dependency
    const tableOrder = ['investors', 'FinancialYear', 'Transaction', 'YearlyProfitDistribution'];
    const sortedStatements = statements.sort((a, b) => {
      const tableA = a.match(/INSERT INTO "(\w+)"/)?.[1] || '';
      const tableB = b.match(/INSERT INTO "(\w+)"/)?.[1] || '';
      return tableOrder.indexOf(tableA) - tableOrder.indexOf(tableB);
    });

    for (const stmt of sortedStatements) {
      // Skip User table to avoid primary key conflict
      if (stmt.includes('INSERT INTO "User"')) continue;

      try {
        await this.prisma.$executeRawUnsafe(stmt);
      } catch (err) {
        this.logger.warn(`⚠️ Skipping error restoring statement: ${err}`);
      }
    }

    this.logger.log(`♻️ Database restored from ${fileName}`);
    return `Database restored from ${fileName}`;
  }

  /** List available backups */
  public listBackups(): string[] {
    return fs.readdirSync(this.backupDir).filter(f => f.endsWith('.sql'));
  }
}