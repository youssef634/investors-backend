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
import { SettingsModule } from './settings/settings.module';
import { FinancialYearModule } from './financial-year/financial-year.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    
    ScheduleModule.forRoot(),

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
    SettingsModule,
    FinancialYearModule,
    DashboardModule,
    
  ],
  controllers: [AppController],
  providers: [AppService, ConfigService, PrismaService, JwtStrategy],
})
export class AppModule { }
