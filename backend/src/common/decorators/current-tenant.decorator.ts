import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppRequest } from '../auth/request-context';

/**
 * Extracts the current tenant ID from the request.
 * Usage: @CurrentTenant() tenantId: string
 */
export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    return request.tenantId as string;
  },
);
