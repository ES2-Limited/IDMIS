import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../context';

export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
