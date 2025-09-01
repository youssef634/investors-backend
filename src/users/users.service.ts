import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private async checkAdmin(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can manage users');
    }
  }

  async createUser(currentUserId: number, dto: CreateUserDto) {
    await this.checkAdmin(currentUserId);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        userName: dto.userName,
        email: dto.email,
        password: hashedPassword,
        role: dto.role ?? Role.USER,
      },
    });
  }

  async updateUser(currentUserId: number, id: number, dto: UpdateUserDto) {
    await this.checkAdmin(currentUserId);

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    let updatedData: any = { ...dto };

    if (dto.password) {
      updatedData.password = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updatedData,
    });
  }

  async deleteUser(currentUserId: number, id: number) {
    await this.checkAdmin(currentUserId);

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.delete({ where: { id } });
  }

  async getAllUsers(
    currentUserId: number,
    page: number = 1,
    searchFilters?: {
      limit?: number;
      id?: number;
      fullName?: string;
      userName?: string;
      email?: string;
    },
  ) {
    await this.checkAdmin(currentUserId);

     const limit = searchFilters?.limit && searchFilters.limit > 0 ? searchFilters.limit : 10;
    const filters: any = {};
    if (searchFilters?.id) filters.id = searchFilters.id;
    if (searchFilters?.fullName) filters.fullName = { contains: searchFilters.fullName, mode: 'insensitive' };
    if (searchFilters?.userName) filters.userName = { contains: searchFilters.userName, mode: 'insensitive' };
    if (searchFilters?.email) filters.email = { contains: searchFilters.email, mode: 'insensitive' };

    const totalUsers = await this.prisma.user.count({ where: filters });
    const totalPages = Math.ceil(totalUsers / limit);
    if (page > totalPages && totalUsers > 0) throw new NotFoundException('Page not found');

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
}
