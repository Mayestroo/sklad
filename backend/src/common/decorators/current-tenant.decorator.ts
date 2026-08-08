import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the current tenant ID from the request.
 * Usage: @CurrentTenant() tenantId: string
 */
export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId;
  },
);
