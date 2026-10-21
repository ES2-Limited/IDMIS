import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { AuthRepository } from './repositories/auth.repository';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import { RedisModule } from '../../platform/redis/redis.module';
import { JwtAuthGuard } from '../../platform/auth/jwt-auth.guard';

@Module({
  imports: [RedisModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    TokenService,
    TotpService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [AuthService, AuthRepository, TokenService, TotpService],
})
export class AuthModule {}
