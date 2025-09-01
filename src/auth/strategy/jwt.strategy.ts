import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {

constructor(private config:ConfigService, private prisma:PrismaService) {
  super({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.get('SECRET'),
  });

}

async validate(payload: any) {
    const user = await this.prisma.user.findFirst({ where: { id: Number(payload.id) } });
    return user;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = await this.validate(request.user);
    if (user) {
      request.user = user; 
      return true;
    }
    return false;
  }

}