import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service/prisma.service';
import { JwtStrategy } from './auth/strategy';
import { LoginModule } from './auth/login/login.module';
import { UsersModule } from './users/users.module';
import { ProfileModule } from './profile/profile.module';
import { InvestorsModule } from './investors/investors.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const secret = config.get<string>('SECRET');
        return {
          secret,
          signOptions: { expiresIn: '7d' },
        };
      },
      global: true,
    }),

    PrismaModule,
    LoginModule,
    UsersModule,
    ProfileModule,
    InvestorsModule,
    TransactionsModule,
    
  ],
  controllers: [AppController],
  providers: [AppService, ConfigService, PrismaService, JwtStrategy],
})
export class AppModule { }
