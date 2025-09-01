import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service/prisma.service';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private config;
    private prisma;
    constructor(config: ConfigService, prisma: PrismaService);
    validate(payload: any): Promise<{
        id: number;
        fullName: string;
        userName: string;
        profileImage: string | null;
        email: string;
        password: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export {};
