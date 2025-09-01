"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvestorsController = void 0;
const common_1 = require("@nestjs/common");
const investors_service_1 = require("./investors.service");
const passport_1 = require("@nestjs/passport");
let InvestorsController = class InvestorsController {
    constructor(investorsService) {
        this.investorsService = investorsService;
    }
    async addInvestor(req, body) {
        return this.investorsService.addInvestor(req.user.id, body);
    }
    async updateInvestor(req, id, body) {
        return this.investorsService.updateInvestor(req.user.id, id, body);
    }
    async deleteInvestor(req, id) {
        return this.investorsService.deleteInvestor(req.user.id, id);
    }
    async getInvestors(req, page, limit, id, userName, phone, minAmount, maxAmount, startDate, endDate, minShare, maxShare) {
        return this.investorsService.getInvestors(req.user.id, Number(page), {
            limit: limit ? Number(limit) : undefined,
            id: id ? Number(id) : undefined,
            userName,
            phone,
            minAmount: minAmount ? Number(minAmount) : undefined,
            maxAmount: maxAmount ? Number(maxAmount) : undefined,
            startDate,
            endDate,
            minShare: minShare ? Number(minShare) : undefined,
            maxShare: maxShare ? Number(maxShare) : undefined,
        });
    }
};
exports.InvestorsController = InvestorsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InvestorsController.prototype, "addInvestor", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", Promise)
], InvestorsController.prototype, "updateInvestor", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], InvestorsController.prototype, "deleteInvestor", null);
__decorate([
    (0, common_1.Get)(':page'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('id')),
    __param(4, (0, common_1.Query)('userName')),
    __param(5, (0, common_1.Query)('phone')),
    __param(6, (0, common_1.Query)('minAmount')),
    __param(7, (0, common_1.Query)('maxAmount')),
    __param(8, (0, common_1.Query)('startDate')),
    __param(9, (0, common_1.Query)('endDate')),
    __param(10, (0, common_1.Query)('minShare')),
    __param(11, (0, common_1.Query)('maxShare')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number, Number, String, String, Number, Number, String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], InvestorsController.prototype, "getInvestors", null);
exports.InvestorsController = InvestorsController = __decorate([
    (0, common_1.Controller)('investors'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [investors_service_1.InvestorsService])
], InvestorsController);
//# sourceMappingURL=investors.controller.js.map