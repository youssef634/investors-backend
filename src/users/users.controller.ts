import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async createUser(@Req() req, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(req.user.id, dto);
  }

  @Patch(':id')
  async updateUser(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(req.user.id, id, dto);
  }

  @Delete(':id')
  async deleteUser(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.deleteUser(req.user.id, id);
  }

  @Get(':page')
  async getAllUsers(
    @Param('page', ParseIntPipe) page: number,
    @Req() req,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.usersService.getAllUsers(req.user.id, page, {
      limit: limit ? Number(limit) : undefined,
      search,
    });
  }
}
