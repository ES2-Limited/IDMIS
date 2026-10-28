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
import { IS_AUTHENTICATED_KEY } from './authenticated.decorator';
import { CAN_PERMISSION_KEY } from './can.decorator';
import { TokenService } from '../../modules/auth/token.service';
import { AuthRepository } from '../../modules/auth/repositories/auth.repository';
import { AuthzService } from './authz.service';
import type { RequestUser } from '../context';
import type { UserAuthz } from './authz.interface';
import type { Permission } from '@idmis/contracts';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
    private readonly authzService: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isAuthenticatedOnly = this.reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermission = this.reflector.getAllAndOverride<Permission>(CAN_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Deny-by-default: handler must declare either @Public(), @Authenticated(), or @Can(...)
    if (!isAuthenticatedOnly && !requiredPermission) {
      throw new ForbiddenException('Route lacks authorization marker - deny by default');
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: RequestUser; authz?: UserAuthz }>();

    const authHeader = request.headers.authorization;
    const url = (request.url || '').split('?')[0];

    // Special case for auth flows that authenticate via tempToken or cookie without Bearer header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (isAuthenticatedOnly) {
        // e.g. /auth/sign-out uses cookie; /auth/change-password and /auth/totp/* can use tempToken in body
        const authAllowedEndpoints = [
          '/auth/sign-out',
          '/auth/change-password',
          '/auth/totp/setup',
          '/auth/totp/verify',
        ];
        if (authAllowedEndpoints.includes(url)) {
          return true;
        }
      }
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

    // Fetch UserAuthz from AuthzService (per-permission scope & Redis cache)
    const authz = await this.authzService.getUserAuthz(user.id);
    const roles = await this.authRepository.getUserRoles(user.id);

    // Default scope for RequestUser context (e.g. core.user.read scope or first available)
    const defaultScope = authz.scopeFor('core.user.read');

    // Attach to request
    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles,
      isSystemAdmin: authz.isSystemAdmin, // Informational only
      mustChangePassword: user.mustChangePassword,
      scope: defaultScope,
      permissions: authz.permissions,
    };
    request.authz = authz;

    // must_change_password enforcement
    if (user.mustChangePassword) {
      const allowedUrls = [
        '/auth/change-password',
        '/auth/sign-out',
        '/auth/me',
        '/auth/me/abilities',
      ];
      if (!allowedUrls.includes(url)) {
        throw new ForbiddenException(
          'Password change required. You must change your temporary password to access this resource.',
        );
      }
    }

    // Permission check for @Can
    if (requiredPermission) {
      if (!authz.can(requiredPermission)) {
        throw new ForbiddenException(`Missing required permission: ${requiredPermission}`);
      }
    }

    return true;
  }
}
