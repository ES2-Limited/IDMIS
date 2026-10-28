import { Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { AuthRepository } from './repositories/auth.repository';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import { RedisModule } from '../../platform/redis/redis.module';
import { JwtAuthGuard } from '../../platform/auth/jwt-auth.guard';
import { AuthzService } from '../../platform/auth/authz.service';
import { RouteMarkerValidator } from '../../platform/auth/route-marker.validator';

@Module({
  imports: [RedisModule, DiscoveryModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    TokenService,
    TotpService,
    AuthzService,
    RouteMarkerValidator,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [AuthService, AuthRepository, TokenService, TotpService, AuthzService],
})
export class AuthModule {}
