import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { UpdatePasswordDto } from './dto/profile.dto';
export declare class ProfileService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getProfile(userId: number): Promise<{
        id: number;
        fullName: string;
        userName: string;
        profileImage: string | null;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    updateName(userId: number, fullName: string): Promise<{
        message: string;
        user: {
            id: number;
            fullName: string;
            userName: string;
            profileImage: string | null;
            email: string;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    uploadProfileImage(userId: number, file?: Express.Multer.File, image?: string): Promise<{
        message: string;
        user: {
            id: number;
            fullName: string;
            userName: string;
            profileImage: string | null;
            email: string;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    removeProfileImage(userId: number): Promise<{
        message: string;
        user: {
            id: number;
            fullName: string;
            userName: string;
            profileImage: string | null;
            email: string;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    updatePassword(userId: number, dto: UpdatePasswordDto): Promise<{
        message: string;
        user?: undefined;
    } | {
        message: string;
        user: {
            id: number;
            fullName: string;
            userName: string;
            profileImage: string | null;
            email: string;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
}
