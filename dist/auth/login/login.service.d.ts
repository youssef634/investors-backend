import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service/prisma.service';
import { LoginDto } from './dto/login.dto';
export declare class LoginService {
    private prisma;
    private jwt;
    constructor(prisma: PrismaService, jwt: JwtService);
    login(data: LoginDto): Promise<{
        message: string;
        token: string;
        user: {
            id: number;
            fullName: string;
            userName: string;
            email: string;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    registerAdmin(email: string, password: string): Promise<{
        message: string;
        admin: {
            id: number;
            email: string;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
}
