"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service/prisma.service");
const bcrypt = __importStar(require("bcrypt"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
let ProfileService = class ProfileService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.BadRequestException('User not found');
        const { password, ...userData } = user;
        return userData;
    }
    async updateName(userId, fullName) {
        if (!fullName || fullName.trim() === '') {
            throw new common_1.BadRequestException('Full name must be provided');
        }
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { fullName },
        });
        const { password, ...userWithoutPassword } = updatedUser;
        return {
            message: 'Name updated successfully',
            user: userWithoutPassword,
        };
    }
    async uploadProfileImage(userId, file, image) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.BadRequestException('User not found');
        const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        let imageUrl = user.profileImage;
        if (file) {
            if (imageUrl?.startsWith('http://localhost:5000/uploads/profiles/')) {
                const oldPath = path.join(uploadDir, path.basename(imageUrl));
                if (fs.existsSync(oldPath))
                    fs.unlinkSync(oldPath);
            }
            const fileName = `${userId}_${Date.now()}${path.extname(file.originalname)}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, file.buffer);
            imageUrl = `http://localhost:5000/uploads/profiles/${fileName}`;
        }
        else if (image && /^data:image\/[a-z]+;base64,/.test(image)) {
            if (imageUrl?.startsWith('http://localhost:5000/uploads/profiles/')) {
                const oldPath = path.join(uploadDir, path.basename(imageUrl));
                if (fs.existsSync(oldPath))
                    fs.unlinkSync(oldPath);
            }
            const matches = image.match(/^data:image\/([a-z]+);base64,(.+)$/);
            const ext = matches ? matches[1] : 'jpg';
            const base64Data = matches ? matches[2] : '';
            const fileName = `${userId}_${Date.now()}_base64.${ext}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
            imageUrl = `http://localhost:5000/uploads/profiles/${fileName}`;
        }
        else if (image &&
            /^https?:\/\//i.test(image) &&
            !image.startsWith('http://localhost:5000/uploads/profiles/')) {
            if (imageUrl?.startsWith('http://localhost:5000/uploads/profiles/')) {
                const oldPath = path.join(uploadDir, path.basename(imageUrl));
                if (fs.existsSync(oldPath))
                    fs.unlinkSync(oldPath);
            }
            const response = await axios_1.default.get(image, { responseType: 'arraybuffer' });
            const ext = response.headers['content-type']?.split('/')[1] || 'jpg';
            const fileName = `${userId}_${Date.now()}_url.${ext}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, response.data);
            imageUrl = `http://localhost:5000/uploads/profiles/${fileName}`;
        }
        else if (image?.startsWith('http://localhost:5000/uploads/profiles/')) {
            imageUrl = image;
        }
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { profileImage: imageUrl },
        });
        const { password, ...userWithoutPassword } = updatedUser;
        return {
            message: 'Profile image updated successfully',
            user: userWithoutPassword,
        };
    }
    async removeProfileImage(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.BadRequestException('User not found');
        if (user.profileImage && user.profileImage.startsWith('http://localhost:5000/uploads/profiles/')) {
            const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
            const oldPath = path.join(uploadDir, path.basename(user.profileImage));
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { profileImage: null },
        });
        const { password, ...userWithoutPassword } = updatedUser;
        return {
            message: 'Profile image removed successfully',
            user: userWithoutPassword,
        };
    }
    async updatePassword(userId, dto) {
        const { oldPassword, newPassword, confirmPassword } = dto;
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.BadRequestException('User not found');
        const isOldPasswordCorrect = await bcrypt.compare(oldPassword, user.password);
        if (!isOldPasswordCorrect) {
            return { message: 'Old password is incorrect' };
        }
        if (newPassword !== confirmPassword) {
            return { message: 'New password and confirmation do not match' };
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });
        const { password, ...userWithoutPassword } = updatedUser;
        return {
            message: 'Password updated successfully',
            user: userWithoutPassword,
        };
    }
};
exports.ProfileService = ProfileService;
exports.ProfileService = ProfileService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProfileService);
//# sourceMappingURL=profile.service.js.map