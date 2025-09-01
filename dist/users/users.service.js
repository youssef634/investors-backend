"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service/prisma.service");
const bcrypt = __importStar(require("bcrypt"));
const client_1 = require("@prisma/client");
let UsersService = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async checkAdmin(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can manage users');
        }
    }
    async createUser(currentUserId, dto) {
        await this.checkAdmin(currentUserId);
        const existingUserName = await this.prisma.user.findUnique({
            where: { userName: dto.userName },
        });
        if (existingUserName) {
            return { message: 'Username already exists' };
        }
        const existingEmail = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (existingEmail) {
            return { message: 'Email already exists' };
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                fullName: dto.fullName,
                userName: dto.userName,
                email: dto.email,
                password: hashedPassword,
                role: dto.role ?? client_1.Role.USER,
            },
        });
        const { password, ...result } = user;
        return result;
    }
    async updateUser(currentUserId, id, dto) {
        await this.checkAdmin(currentUserId);
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (dto.userName) {
            const existingUser = await this.prisma.user.findUnique({
                where: { userName: dto.userName },
            });
            if (existingUser && existingUser.id !== id) {
                return { message: 'Username already exists' };
            }
        }
        let updatedData = { ...dto };
        if (dto.password) {
            updatedData.password = await bcrypt.hash(dto.password, 10);
        }
        const updatedUser = await this.prisma.user.update({
            where: { id },
            data: updatedData,
        });
        const { password, ...result } = updatedUser;
        return result;
    }
    async deleteUser(currentUserId, id) {
        await this.checkAdmin(currentUserId);
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const deletedUser = await this.prisma.user.delete({ where: { id } });
        const { password, ...result } = deletedUser;
        return result;
    }
    async getAllUsers(currentUserId, page = 1, searchFilters) {
        await this.checkAdmin(currentUserId);
        const limit = searchFilters?.limit && searchFilters.limit > 0 ? searchFilters.limit : 10;
        const filters = {};
        if (searchFilters?.id)
            filters.id = searchFilters.id;
        if (searchFilters?.fullName)
            filters.fullName = { contains: searchFilters.fullName, mode: 'insensitive' };
        if (searchFilters?.userName)
            filters.userName = { contains: searchFilters.userName, mode: 'insensitive' };
        if (searchFilters?.email)
            filters.email = { contains: searchFilters.email, mode: 'insensitive' };
        const totalUsers = await this.prisma.user.count({ where: filters });
        const totalPages = Math.ceil(totalUsers / limit);
        if (page > totalPages && totalUsers > 0)
            throw new common_1.NotFoundException('Page not found');
        const skip = (page - 1) * limit;
        const users = await this.prisma.user.findMany({
            where: filters,
            skip,
            take: limit,
            select: {
                id: true,
                fullName: true,
                userName: true,
                email: true,
                role: true,
            },
        });
        return {
            totalUsers,
            totalPages,
            currentPage: page,
            users,
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map