"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvestorsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service/prisma.service");
const client_1 = require("@prisma/client");
let InvestorsService = class InvestorsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async checkAdmin(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can manage investors');
        }
    }
    async addInvestor(currentUserId, data) {
        await this.checkAdmin(currentUserId);
        const user = await this.prisma.user.findUnique({
            where: { userName: data.userName },
        });
        if (!user) {
            throw new common_1.BadRequestException(`User with username "${data.userName}" does not exist`);
        }
        return this.prisma.investors.create({
            data: {
                ...data,
                createdAt: new Date(),
            },
        });
    }
    async updateInvestor(currentUserId, id, data) {
        await this.checkAdmin(currentUserId);
        const allowedFields = {};
        if (data.phone !== undefined)
            allowedFields.phone = data.phone;
        if (data.amount !== undefined)
            allowedFields.amount = data.amount;
        if (data.createdAt !== undefined)
            allowedFields.createdAt = data.createdAt;
        return this.prisma.investors.update({
            where: { id },
            data: allowedFields,
        });
    }
    async deleteInvestor(currentUserId, id) {
        await this.checkAdmin(currentUserId);
        return this.prisma.investors.delete({
            where: { id },
        });
    }
    async getInvestors(currentUserId, page = 1, searchFilters) {
        await this.checkAdmin(currentUserId);
        const limit = searchFilters?.limit && searchFilters.limit > 0 ? searchFilters.limit : 10;
        const filters = {};
        if (searchFilters?.id)
            filters.id = searchFilters.id;
        if (searchFilters?.userName)
            filters.userName = { contains: searchFilters.userName, mode: 'insensitive' };
        if (searchFilters?.phone)
            filters.phone = { contains: searchFilters.phone, mode: 'insensitive' };
        if (searchFilters?.minAmount !== undefined || searchFilters?.maxAmount !== undefined)
            filters.amount = {
                gte: searchFilters.minAmount ?? undefined,
                lte: searchFilters.maxAmount ?? undefined,
            };
        if (searchFilters?.startDate || searchFilters?.endDate)
            filters.createdAt = {
                gte: searchFilters.startDate ? new Date(searchFilters.startDate) : undefined,
                lte: searchFilters.endDate ? new Date(searchFilters.endDate) : undefined,
            };
        const totalInvestors = await this.prisma.investors.count({ where: filters });
        const totalPages = Math.ceil(totalInvestors / limit);
        if (page > totalPages && totalInvestors > 0)
            throw new common_1.NotFoundException('Page not found');
        const skip = (page - 1) * limit;
        const investors = await this.prisma.investors.findMany({
            where: filters,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        });
        const totalAmountAll = (await this.prisma.investors.aggregate({ _sum: { amount: true } }))._sum.amount || 0;
        const investorsWithShares = investors
            .map((inv) => ({
            ...inv,
            sharePercentage: totalAmountAll > 0 ? (inv.amount / totalAmountAll) * 100 : 0,
        }))
            .filter((inv) => {
            if (searchFilters?.minShare !== undefined && inv.sharePercentage < searchFilters.minShare)
                return false;
            if (searchFilters?.maxShare !== undefined && inv.sharePercentage > searchFilters.maxShare)
                return false;
            return true;
        });
        return {
            totalInvestors: investorsWithShares.length,
            totalPages,
            currentPage: page,
            totalAmount: totalAmountAll,
            investors: investorsWithShares,
        };
    }
};
exports.InvestorsService = InvestorsService;
exports.InvestorsService = InvestorsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InvestorsService);
//# sourceMappingURL=investors.service.js.map