"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvestorsModule = void 0;
const common_1 = require("@nestjs/common");
const investors_service_1 = require("./investors.service");
const investors_controller_1 = require("./investors.controller");
const prisma_service_1 = require("../prisma/prisma.service/prisma.service");
let InvestorsModule = class InvestorsModule {
};
exports.InvestorsModule = InvestorsModule;
exports.InvestorsModule = InvestorsModule = __decorate([
    (0, common_1.Module)({
        controllers: [investors_controller_1.InvestorsController],
        providers: [investors_service_1.InvestorsService, prisma_service_1.PrismaService],
    })
], InvestorsModule);
//# sourceMappingURL=investors.module.js.map