import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    createUser(req: any, dto: CreateUserDto): Promise<{
        id: number;
        fullName: string;
        userName: string;
        profileImage: string | null;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    } | {
        message: string;
    }>;
    updateUser(req: any, id: number, dto: UpdateUserDto): Promise<{
        id: number;
        fullName: string;
        userName: string;
        profileImage: string | null;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    } | {
        message: string;
    }>;
    deleteUser(req: any, id: number): Promise<{
        id: number;
        fullName: string;
        userName: string;
        profileImage: string | null;
        email: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    getAllUsers(page: number, req: any, limit: number, id?: number, fullName?: string, userName?: string, email?: string): Promise<{
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
