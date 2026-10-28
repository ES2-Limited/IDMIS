import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { UserAuthz } from './authz.interface';

export const CurrentAuthz = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserAuthz | undefined => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { authz?: UserAuthz }>();
    return request.authz;
  },
);
