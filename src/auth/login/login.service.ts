import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class LoginService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
    ) { }

    async login(data: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: data.email },
        });

        if (!user) throw new UnauthorizedException('Invalid email or password');

        const isPasswordValid = await bcrypt.compare(data.password, user.password);
        if (!isPasswordValid) throw new UnauthorizedException('Invalid email or password');

        const token = await this.jwt.signAsync({ id: user.id, role: user.role });

        return {
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                fullName: user.fullName,
                phone: user.phone,
                email: user.email,
                role: user.role,
            },
        };
    }
    // ⚡ Temporary register method for admin
    async registerAdmin(email: string, password: string) {
        const existing = await this.prisma.user.findUnique({ where: { email } });
        if (existing) throw new BadRequestException('Admin already exists');

        const hashedPassword = await bcrypt.hash(password, 10);

        const admin = await this.prisma.user.create({
            data: {
                fullName: 'System Admin',
                phone: '1234567890',
                email,
                password: hashedPassword,
                role: 'ADMIN',
            },
        });

        return {
            message: 'Admin registered successfully',
            admin: {
                id: admin.id,
                email: admin.email,
                role: admin.role,
            },
        };
    }
}