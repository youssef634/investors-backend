import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

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

    // check duplicates
    const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingEmail) throw new BadRequestException('Email already exists');

    const existingPhone = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existingPhone) throw new BadRequestException('Phone already exists');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        password: hashedPassword,
        role: Role.ADMIN,
      },
    });

    const { password, ...result } = user;
    return result;
  }

  async updateUser(currentUserId: number, id: number, dto: UpdateUserDto) {
    await this.checkAdmin(currentUserId);

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updatedData: any = {};
    if (dto.fullName) updatedData.fullName = dto.fullName;
    if (dto.phone) {
      const existingPhone = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existingPhone && existingPhone.id !== id) throw new BadRequestException('Phone already exists');
      updatedData.phone = dto.phone;
    }
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existingEmail && existingEmail.id !== id) throw new BadRequestException('Email already exists');
      updatedData.email = dto.email;
    }
    const updatedUser = await this.prisma.user.update({ where: { id }, data: updatedData });
    const { password, ...result } = updatedUser;
    return result;
  }

  async deleteUser(currentUserId: number, id: number) {
    await this.checkAdmin(currentUserId);

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // remove profile image if exists
    if (user.profileImage && user.profileImage.startsWith('http://localhost:5000/uploads/profiles/')) {
      const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
      const oldPath = path.join(uploadDir, path.basename(user.profileImage));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const deletedUser = await this.prisma.user.delete({ where: { id } });
    const { password, ...result } = deletedUser;
    return result;
  }

  async getAllUsers(currentUserId: number, page: number = 1, searchFilters?: { limit?: number; id?: number; fullName?: string; email?: string }) {
    await this.checkAdmin(currentUserId);

    const limit = searchFilters?.limit && searchFilters.limit > 0 ? searchFilters.limit : 10;
    const filters: any = { role: Role.ADMIN }; // ✅ only admins

    if (searchFilters?.id) filters.id = searchFilters.id;
    if (searchFilters?.fullName) filters.fullName = { contains: searchFilters.fullName, mode: 'insensitive' };
    if (searchFilters?.email) filters.email = { contains: searchFilters.email, mode: 'insensitive' };

    const totalUsers = await this.prisma.user.count({ where: filters });
    const totalPages = Math.ceil(totalUsers / limit);
    if (page > totalPages && totalUsers > 0) throw new NotFoundException('Page not found');

    const skip = (page - 1) * limit;

    const users = await this.prisma.user.findMany({
      where: filters,
      skip,
      take: limit,
      select: { id: true, fullName: true, phone: true, email: true },
    });

    return { totalUsers, totalPages, currentPage: page, users };
  }
}