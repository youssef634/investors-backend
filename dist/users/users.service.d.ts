import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    private checkAdmin;
    createUser(currentUserId: number, dto: CreateUserDto): Promise<{
        id: number;
        userName: string;
        email: string;
        fullName: string;
        password: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    updateUser(currentUserId: number, id: number, dto: UpdateUserDto): Promise<{
        id: number;
        userName: string;
        email: string;
        fullName: string;
        password: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    deleteUser(currentUserId: number, id: number): Promise<{
        id: number;
        userName: string;
        email: string;
        fullName: string;
        password: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    getAllUsers(currentUserId: number, page?: number, searchFilters?: {
        limit?: number;
        id?: number;
        fullName?: string;
        userName?: string;
        email?: string;
    }): Promise<{
        totalUsers: number;
        totalPages: number;
        currentPage: number;
        users: {
            id: number;
            userName: string;
            email: string;
            fullName: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
    }>;
}
