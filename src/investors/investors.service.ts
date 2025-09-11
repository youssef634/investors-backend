import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { Role } from '@prisma/client';
import { DateTime, Settings } from 'luxon';
import * as XLSX from 'xlsx';

@Injectable()
export class InvestorsService {
    constructor(private prisma: PrismaService) { }

    private async checkAdmin(userId: number) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can manage investors');
        }
    }

    async addInvestor(
        currentUserId: number,
        fullName: string,
        phone: string | null,
        amount: number,
        createdAt?: Date
    ) {
        await this.checkAdmin(currentUserId);

        if (phone) {
            const existingInvestor = await this.prisma.investors.findUnique({ where: { phone } });
            if (existingInvestor) throw new BadRequestException('Investor with this phone already exists');
        }

        const settings = await this.prisma.settings.findFirst();
        if (!settings) throw new BadRequestException('Settings not found');

        const currency = settings.defaultCurrency;

        // ✅ Normalize to USD
        let amountInUSD = 0;
        if (!isNaN(amount)) {
            if (currency === 'USD') amountInUSD = amount;
            else if (currency === 'IQD') amountInUSD = amount / settings.USDtoIQD;
            else throw new BadRequestException('Unsupported currency');
        }

        return this.prisma.$transaction(async (tx) => {
            const investor = await tx.investors.create({
                data: {
                    fullName,
                    phone,
                    amount: amountInUSD,
                    rollover_amount: 0,
                    total_amount: amountInUSD, // ✅ save total
                    createdAt: createdAt ?? new Date(),
                },
            });

            if (amountInUSD > 0) {
                await tx.transaction.create({
                    data: {
                        investorId: investor.id,
                        type: 'DEPOSIT',
                        amount, // original entered amount
                        currency: settings.defaultCurrency, // ✅ force default
                        date: createdAt ?? new Date(),
                    },
                });
            }

            return investor;
        });
    }

    async importInvestorsFromExcel(currentUserId: number, fileBuffer: Buffer) {
        await this.checkAdmin(currentUserId);

        function excelDateToJSDate(serial?: number): Date {
            if (!serial || isNaN(serial)) return new Date();
            const utc_days = Math.floor(serial - 25569);
            const utc_value = utc_days * 86400;
            const date_info = new Date(utc_value * 1000);
            return new Date(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate());
        }

        try {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet);

            const imported: any[] = [];
            const skipped: any[] = [];

            const settings = await this.prisma.settings.findFirst();
            if (!settings) throw new BadRequestException('Settings not found');

            for (const row of rows) {
                const fullName = row['fullName'] || row['الاسم'] || row['الاسم الكامل'];
                const phone = row['phone'] || row['رقم الهاتف'] || row['الهاتف'] || null;
                const amount = Number(row['amount'] || row['المبلغ']) || 0;
                const currency = row['currency'] || row['العملة'] || settings.defaultCurrency; // ✅ default USD if not provided
                const createdAt =
                    row['createdAt'] && !isNaN(Date.parse(row['createdAt']))
                        ? new Date(row['createdAt'])
                        : row['تاريخ الانضمام']
                            ? excelDateToJSDate(row['تاريخ الانضمام'])
                            : new Date();

                if (!fullName || isNaN(amount)) {
                    skipped.push({ row, reason: 'Missing required fields' });
                    continue;
                }

                if (phone) {
                    const existing = await this.prisma.investors.findUnique({ where: { phone } });
                    if (existing) {
                        skipped.push({ row, reason: 'Phone already exists' });
                        continue;
                    }
                }

                // ✅ Convert to USD
                let amountInUSD = 0;
                if (currency === 'USD') {
                    amountInUSD = amount;
                } else if (currency === 'IQD') {
                    amountInUSD = amount / settings.USDtoIQD;
                } else {
                    skipped.push({ row, reason: 'Unsupported currency' });
                    continue;
                }

                // Wrap in transaction
                const investor = await this.prisma.$transaction(async (tx) => {
                    const inv = await tx.investors.create({
                        data: { fullName, phone, amount: amountInUSD, createdAt },
                    });

                    if (amountInUSD > 0) {
                        await tx.transaction.create({
                            data: {
                                investorId: inv.id,
                                type: 'DEPOSIT',
                                amount,
                                currency,
                                date: createdAt,
                            },
                        });
                    }

                    return inv;
                });

                imported.push(investor);
            }

            return {
                importedCount: imported.length,
                skippedCount: skipped.length,
                imported,
                skipped,
            };
        } catch (err: any) {
            console.error('Excel import error:', err);
            throw new BadRequestException('Invalid Excel file: ' + (err.message || 'Unknown error'));
        }
    }

    async updateInvestor(
        currentUserId: number,
        id: number,
        dto: { fullName?: string; phone?: string; createdAt?: Date }
    ) {
        await this.checkAdmin(currentUserId);

        const investor = await this.prisma.investors.findUnique({ where: { id } });
        if (!investor) throw new NotFoundException('Investor not found');

        const updateData: any = {};
        if (dto.fullName !== undefined) updateData.fullName = dto.fullName;
        if (dto.phone !== undefined) updateData.phone = dto.phone;          // ✅ update phone
        if (dto.createdAt !== undefined) updateData.createdAt = dto.createdAt; // ✅ update createdAt

        return this.prisma.investors.update({
            where: { id },
            data: updateData,
        });
    }

    async deleteInvestors(currentUserId: number, ids: number | number[]) {
        await this.checkAdmin(currentUserId);

        const investorIds = Array.isArray(ids) ? ids : [ids];

        const existingInvestors = await this.prisma.investors.findMany({
            where: { id: { in: investorIds } },
        });

        if (existingInvestors.length !== investorIds.length) {
            throw new NotFoundException('Some investors were not found');
        }

        await this.prisma.$transaction(async (tx) => {
            // Delete related transactions
            await tx.transaction.deleteMany({ where: { investorId: { in: investorIds } } });

            // Delete related profit distributions
            await tx.yearlyProfitDistribution.deleteMany({ where: { investorId: { in: investorIds } } });

            // Finally, delete investors
            await tx.investors.deleteMany({ where: { id: { in: investorIds } } });
        });

        return {
            message: `Investors ${investorIds.join(', ')} and related data deleted successfully`,
            deletedIds: investorIds
        };
    }

    async getInvestors(
        currentUserId: number,
        page: number = 1,
        searchFilters?: {
            limit?: number;
            fullName?: string;
            email?: string;
            minAmount?: number;
            maxAmount?: number;
            startDate?: string;
            endDate?: string;
            minShare?: number;
            maxShare?: number;
        },
    ) {
        await this.checkAdmin(currentUserId);

        const limit = searchFilters?.limit && searchFilters.limit > 0 ? searchFilters.limit : 10;
        const filters: any = {};

        if (searchFilters?.fullName) {
            filters.fullName = { contains: searchFilters.fullName, mode: 'insensitive' };
        }
        if (searchFilters?.email) {
            filters.email = { contains: searchFilters.email, mode: 'insensitive' };
        }
        if (searchFilters?.minAmount !== undefined || searchFilters?.maxAmount !== undefined) {
            filters.amount = {};
            if (searchFilters.minAmount !== undefined) filters.amount.gte = searchFilters.minAmount;
            if (searchFilters.maxAmount !== undefined) filters.amount.lte = searchFilters.maxAmount;
        }
        if (searchFilters?.startDate || searchFilters?.endDate) {
            filters.createdAt = {};
            if (searchFilters.startDate) filters.createdAt.gte = new Date(searchFilters.startDate);
            if (searchFilters.endDate) filters.createdAt.lte = new Date(searchFilters.endDate);
        }

        const totalInvestors = await this.prisma.investors.count({ where: filters });
        const totalPages = Math.ceil(totalInvestors / limit);
        if (page > totalPages && totalInvestors > 0) throw new NotFoundException('Page not found');

        const skip = (page - 1) * limit;

        const investors = await this.prisma.investors.findMany({
            where: filters,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        });

        // تصحيح حساب إجمالي المبالغ
        const totals = await this.prisma.investors.aggregate({
            where: filters,
            _sum: {
                amount: true,
                rollover_amount: true,
            }
        });

        const totalAmountAll = totals._sum.amount || 0;
        const totalProfitAll = totals._sum.rollover_amount || 0;

        const settings = await this.prisma.settings.findFirst();
        const timezone = settings?.timezone || 'UTC';

        let formattedInvestors = investors.map((inv) => {
            const sharePercentage = totalAmountAll > 0 ? (inv.amount / totalAmountAll) * 100 : 0;

            return {
                id: inv.id,
                fullName: inv.fullName,
                phone: inv.phone,
                amount: inv.amount,
                rollover: inv.rollover_amount,
                totalAmount: inv.amount + inv.rollover_amount,
                sharePercentage,
                currency: settings.defaultCurrency,
                createdAt: DateTime.fromJSDate(inv.createdAt, { zone: 'utc' })
                    .setZone(timezone)
                    .toFormat('MMM dd, yyyy'),
            };
        });

        if (searchFilters?.minShare !== undefined) {
            formattedInvestors = formattedInvestors.filter(
                (inv) => inv.sharePercentage >= searchFilters.minShare!,
            );
        }
        if (searchFilters?.maxShare !== undefined) {
            formattedInvestors = formattedInvestors.filter(
                (inv) => inv.sharePercentage <= searchFilters.maxShare!,
            );
        }

        return {
            totalInvestors,
            totalPages,
            currentPage: page,
            totalAmount: totalAmountAll,
            totalRollover: totalProfitAll,
            investors: formattedInvestors,
        };
    }
}