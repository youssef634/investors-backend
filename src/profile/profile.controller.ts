import {
    Controller,
    Get,
    Put,
    UseGuards,
    Body,
    Param,
    ParseIntPipe,
    UploadedFile,
    UseInterceptors,
    Delete,
    Request,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { UpdatePasswordDto } from './dto/profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';

@Controller('profile')
@UseGuards(AuthGuard('jwt'))
export class ProfileController {
    constructor(private readonly profileService: ProfileService) { }

    @Get()
    getProfile(@Request() req: any) {
        return this.profileService.getProfile(req.user.id);
    }

    @Put('update-name')
    updateName(@Request() req: any, @Body('fullName') fullName: string,) {
        return this.profileService.updateName(req.user.id, fullName);
    }

    @Put('upload-image')
    @UseInterceptors(FileInterceptor('file'))
    async uploadProfileImage(
        @Request() req: any,
        @UploadedFile() file?: Express.Multer.File,
        @Body('image') image?: string,
    ) {
        return this.profileService.uploadProfileImage(req.user.id, file, image);
    }

    @Delete('delete-image')
    async removeProfileImage(@Request() req: any) {
        return this.profileService.removeProfileImage(req.user.id);
    }

    @Put('update-password')
    async updatePassword(
        @Request() req: any,
        @Body() dto: UpdatePasswordDto,
    ) {
        return this.profileService.updatePassword(req.user.id, dto);
    }
}