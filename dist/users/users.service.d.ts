import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    private checkAdmin;
    createUser(currentUserId: number, dto: CreateUserDto): Promise<{
        id: number;
        fullName: string;
        userName: string;
        profileImage: string | null;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    } | {
        message: string;
    }>;
    updateUser(currentUserId: number, id: number, dto: UpdateUserDto): Promise<{
        id: number;
        fullName: string;
        userName: string;
        profileImage: string | null;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    } | {
        message: string;
    }>;
    deleteUser(currentUserId: number, id: number): Promise<{
        id: number;
        fullName: string;
        userName: string;
        profileImage: string | null;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    getAllUsers(currentUserId: number, page?: number, searchFilters?: {
        limit?: number;
        search?: string;
    }): Promise<{
        totalUsers: number;
        totalPages: number;
        currentPage: number;
        users: {
            id: number;
            fullName: string;
            userName: string;
            email: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
    }>;
}
