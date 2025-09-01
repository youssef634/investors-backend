import { PrismaService } from '../prisma/prisma.service/prisma.service';
export declare class InvestorsService {
    private prisma;
    constructor(prisma: PrismaService);
    private checkAdmin;
    addInvestor(currentUserId: number, data: {
        userName: string;
        phone: string;
        amount: number;
    }): Promise<{
        phone: string;
        amount: number;
        createdAt: Date;
        id: number;
        userName: string;
    }>;
    updateInvestor(currentUserId: number, id: number, data: Partial<{
        phone: string;
        amount: number;
        createdAt: Date;
    }>): Promise<{
        phone: string;
        amount: number;
        createdAt: Date;
        id: number;
        userName: string;
    }>;
    deleteInvestor(currentUserId: number, id: number): Promise<{
        phone: string;
        amount: number;
        createdAt: Date;
        id: number;
        userName: string;
    }>;
    getInvestors(currentUserId: number, page?: number, searchFilters?: {
        limit?: number;
        id?: number;
        userName?: string;
        phone?: string;
        minAmount?: number;
        maxAmount?: number;
        startDate?: string;
        endDate?: string;
        minShare?: number;
        maxShare?: number;
    }): Promise<{
        totalInvestors: number;
        totalPages: number;
        currentPage: number;
        totalAmount: number;
        investors: {
            sharePercentage: number;
            phone: string;
            amount: number;
            createdAt: Date;
            id: number;
            userName: string;
        }[];
    }>;
}
