import { InvestorsService } from './investors.service';
export declare class InvestorsController {
    private readonly investorsService;
    constructor(investorsService: InvestorsService);
    addInvestor(req: any, body: {
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
    updateInvestor(req: any, id: number, body: Partial<{
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
    deleteInvestor(req: any, id: number): Promise<{
        phone: string;
        amount: number;
        createdAt: Date;
        id: number;
        userName: string;
    }>;
    getInvestors(req: any, page: number, limit?: number, id?: number, userName?: string, phone?: string, minAmount?: number, maxAmount?: number, startDate?: string, endDate?: string, minShare?: number, maxShare?: number): Promise<{
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
