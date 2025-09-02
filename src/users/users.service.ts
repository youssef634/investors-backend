import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  private async checkAdmin(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can manage users');
    }
  }

  async createUser(currentUserId: number, dto: CreateUserDto) {
    await this.checkAdmin(currentUserId);

    // Check if username exists
    const existingUserName = await this.prisma.user.findUnique({
      where: { userName: dto.userName },
    });
    if (existingUserName) {
      return { message: 'Username already exists' };
    }

    // Check if email exists
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      return { message: 'Email already exists' };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        userName: dto.userName,
        email: dto.email,
        password: hashedPassword,
        role: dto.role ?? Role.USER,
      },
    });

    // Exclude password from response
    const { password, ...result } = user;
    return result;
  }

  async updateUser(currentUserId: number, id: number, dto: UpdateUserDto) {
    await this.checkAdmin(currentUserId);

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.userName) {
      const existingUser = await this.prisma.user.findUnique({
        where: { userName: dto.userName },
      });
      if (existingUser && existingUser.id !== id) {
        return { message: 'Username already exists' };
      }
    }

    let updatedData: any = { ...dto };

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

  async deleteUser(currentUserId: number, id: number) {
    await this.checkAdmin(currentUserId);

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const deletedUser = await this.prisma.user.delete({ where: { id } });

    const { password, ...result } = deletedUser;
    return result;
  }

  async getAllUsers(
    currentUserId: number,
    page: number = 1,
    searchFilters?: {
      limit?: number;
      search?: string;  
    },
  ) {
    await this.checkAdmin(currentUserId);
  
    const limit = searchFilters?.limit && searchFilters.limit > 0 ? searchFilters.limit : 10;
    const filters: any = {};
    
    if (searchFilters?.search) {
      filters.OR = [  
        // Remove the ID search since it's an integer field
        { fullName: { contains: searchFilters.search, mode: 'insensitive' } },
        { userName: { contains: searchFilters.search, mode: 'insensitive' } },
        { email: { contains: searchFilters.search, mode: 'insensitive' } },
      ];
    }
    
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