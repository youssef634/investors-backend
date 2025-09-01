import { ProfileService } from './profile.service';
import { UpdatePasswordDto } from './dto/profile.dto';
export declare class ProfileController {
    private readonly profileService;
    constructor(profileService: ProfileService);
    getProfile(req: any): Promise<{
        id: number;
        userName: string;
        email: string;
        fullName: string;
        profileImage: string | null;
        role: import(".prisma/client").$Enums.Role;
    }>;
    updateName(req: any, fullName: string): Promise<{
        message: string;
        user: {
            id: number;
            userName: string;
            email: string;
            fullName: string;
            profileImage: string | null;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    uploadProfileImage(req: any, file?: Express.Multer.File, image?: string): Promise<{
        message: string;
        user: {
            id: number;
            userName: string;
            email: string;
            fullName: string;
            profileImage: string | null;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    removeProfileImage(req: any): Promise<{
        message: string;
        user: {
            id: number;
            userName: string;
            email: string;
            fullName: string;
            profileImage: string | null;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    updatePassword(req: any, dto: UpdatePasswordDto): Promise<{
        message: string;
        user?: undefined;
    } | {
        message: string;
        user: {
            id: number;
            userName: string;
            email: string;
            fullName: string;
            profileImage: string | null;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
}
