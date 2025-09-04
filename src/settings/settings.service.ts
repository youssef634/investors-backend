import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class SettingsService {
    constructor(private prisma: PrismaService) { }

    async getSettings(userId: number) {
        const settings = await this.prisma.settings.findUnique({ where: { userId } });
        if (!settings) throw new BadRequestException('Settings not found');
        return settings;
    }

    async updateSettings(userId: number, data: any, userRole: Role) {
        const updatedData: any = {};

        if (data.defaultCurrency) updatedData.defaultCurrency = data.defaultCurrency;

        if (data.USDtoIQD !== undefined) {
            if (userRole !== Role.ADMIN) {
                throw new ForbiddenException('Only admin can update USDtoIQD rate');
            }
            updatedData.USDtoIQD = data.USDtoIQD;
        }

        if (data.timezone) {
            updatedData.timezone = data.timezone; // ✅ Add timezone
        }

        const settings = await this.prisma.settings.upsert({
            where: { userId },
            update: updatedData,
            create: {
                userId,
                defaultCurrency: updatedData.defaultCurrency || 'IQD',
                USDtoIQD: updatedData.USDtoIQD || 0,
                timezone: updatedData.timezone || 'UTC', // ✅ Default to UTC
            },
        });

        return settings;
    }
}