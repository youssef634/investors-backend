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
exports.ProfileController = void 0;
const common_1 = require("@nestjs/common");
const profile_service_1 = require("./profile.service");
const profile_dto_1 = require("./dto/profile.dto");
const platform_express_1 = require("@nestjs/platform-express");
const passport_1 = require("@nestjs/passport");
let ProfileController = class ProfileController {
    constructor(profileService) {
        this.profileService = profileService;
    }
    getProfile(req) {
        return this.profileService.getProfile(req.user.id);
    }
    updateName(req, fullName) {
        return this.profileService.updateName(req.user.id, fullName);
    }
    async uploadProfileImage(req, file, image) {
        return this.profileService.uploadProfileImage(req.user.id, file, image);
    }
    async removeProfileImage(req) {
        return this.profileService.removeProfileImage(req.user.id);
    }
    async updatePassword(req, dto) {
        return this.profileService.updatePassword(req.user.id, dto);
    }
};
exports.ProfileController = ProfileController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ProfileController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Put)('update-name'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)('fullName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ProfileController.prototype, "updateName", null);
__decorate([
    (0, common_1.Put)('upload-image'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)('image')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "uploadProfileImage", null);
__decorate([
    (0, common_1.Delete)('delete-image'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "removeProfileImage", null);
__decorate([
    (0, common_1.Put)('update-password'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, profile_dto_1.UpdatePasswordDto]),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "updatePassword", null);
exports.ProfileController = ProfileController = __decorate([
    (0, common_1.Controller)('profile'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [profile_service_1.ProfileService])
], ProfileController);
//# sourceMappingURL=profile.controller.js.map