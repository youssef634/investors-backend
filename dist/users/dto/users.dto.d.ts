import { Role } from '@prisma/client';
export declare class CreateUserDto {
    fullName: string;
    userName: string;
    email: string;
    password: string;
    role?: Role;
}
export declare class UpdateUserDto {
    fullName?: string;
    userName?: string;
    email?: string;
    password?: string;
    role?: Role;
}
