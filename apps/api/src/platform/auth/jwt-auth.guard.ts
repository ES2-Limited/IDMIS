import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenService } from '../../modules/auth/token.service';
import { AuthRepository } from '../../modules/auth/repositories/auth.repository';
import type { RequestUser } from '../context';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: RequestUser }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7).trim();
    const payload = await this.tokenService.verifyAccessToken(token);

    // Verify session
    const session = await this.authRepository.findSessionById(payload.sid);
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }
    if (session.revokedAt !== null) {
      throw new UnauthorizedException('Session has been revoked');
    }
    if (new Date(session.expiresAt) < new Date()) {
      throw new UnauthorizedException('Session has expired');
    }

    // Verify user
    const user = await this.authRepository.findUserById(payload.sub);
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    const roles = await this.authRepository.getUserRoles(user.id);
    const isSystemAdmin = roles.includes('system_admin');
    const scope = await this.authRepository.getUserScope(user.id);
    const permissions = await this.authRepository.getUserPermissions(user.id);

    // Attach to request
    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles,
      isSystemAdmin,
      mustChangePassword: user.mustChangePassword,
      scope,
      permissions,
    };

    // must_change_password enforcement
    if (user.mustChangePassword) {
      const url = request.url.split('?')[0];
      const allowedUrls = ['/auth/change-password', '/auth/sign-out', '/auth/me'];
      if (!allowedUrls.includes(url)) {
        throw new ForbiddenException(
          'Password change required. You must change your temporary password to access this resource.',
        );
      }
    }

    return true;
  }
}
