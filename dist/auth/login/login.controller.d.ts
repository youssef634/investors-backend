import { LoginService } from './login.service';
import { LoginDto } from './dto/login.dto';
export declare class LoginController {
    private readonly loginService;
    constructor(loginService: LoginService);
    login(dto: LoginDto): Promise<{
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
