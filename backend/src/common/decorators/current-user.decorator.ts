import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppRequest, AuthenticatedUser } from '../auth/request-context';

/**
 * Extracts the current authenticated user from the request.
 * Usage: @CurrentUser() user: { id: string; tenantId: string; email: string }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
