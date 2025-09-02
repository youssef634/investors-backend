import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service/prisma.service';
import { UpdatePasswordDto } from './dto/profile.dto';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class ProfileService {
    constructor(private readonly prisma: PrismaService) { }

    async getProfile(userId: number) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new BadRequestException('User not found');

        const { password, ...userData } = user;
        return userData;
    }

    async updateName(userId: number, fullName: string) {
        if (!fullName || fullName.trim() === '') {
            throw new BadRequestException('Full name must be provided');
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

    async uploadProfileImage(
        userId: number,
        file?: Express.Multer.File,
        image?: string,
    ) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new BadRequestException('User not found');

        const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        let imageUrl = user.profileImage;

        // Helper: delete old profile image
        const deleteOldImage = () => {
            if (imageUrl?.startsWith('http://localhost:5000/uploads/profiles/')) {
                const oldPath = path.join(uploadDir, path.basename(imageUrl));
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        };

        if (file) {
            deleteOldImage();
            const fileName = `${userId}_${Date.now()}${path.extname(file.originalname)}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, file.buffer);
            imageUrl = `http://localhost:5000/uploads/profiles/${fileName}`;

        } else if (image && /^data:image\/[a-z]+;base64,/.test(image)) {
            deleteOldImage();
            const matches = image.match(/^data:image\/([a-z]+);base64,(.+)$/);
            const ext = matches ? matches[1] : 'jpg';
            const base64Data = matches ? matches[2] : '';
            const fileName = `${userId}_${Date.now()}_base64.${ext}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
            imageUrl = `http://localhost:5000/uploads/profiles/${fileName}`;

        } else if (image && /^https?:\/\//i.test(image) && !image.startsWith('http://localhost:5000/uploads/profiles/')) {
            deleteOldImage();
            const response = await axios.get(image, { responseType: 'arraybuffer' });
            const ext = response.headers['content-type']?.split('/')[1] || 'jpg';
            const fileName = `${userId}_${Date.now()}_url.${ext}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, response.data);
            imageUrl = `http://localhost:5000/uploads/profiles/${fileName}`;

        } else if (image?.startsWith('http://localhost:5000/uploads/profiles/')) {
            // keep current image
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

    async removeProfileImage(userId: number) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new BadRequestException('User not found');

        if (user.profileImage && user.profileImage.startsWith('http://localhost:5000/uploads/profiles/')) {
            const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
            const oldPath = path.join(uploadDir, path.basename(user.profileImage));
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath); // delete from filesystem
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

    async updatePassword(userId: number, dto: UpdatePasswordDto) {
        const { oldPassword, newPassword, confirmPassword } = dto;

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new BadRequestException('User not found');

        const isOldPasswordCorrect = await bcrypt.compare(
            oldPassword,
            user.password,
        );
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
}