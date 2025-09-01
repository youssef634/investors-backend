import { Body, Controller, Post } from '@nestjs/common';
import { LoginService } from './login.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.loginService.login(dto);
  }

  // ⚡ Temporary endpoint to create admin
  @Post('register-admin')
  async registerAdmin(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.loginService.registerAdmin(email, password);
  }

}