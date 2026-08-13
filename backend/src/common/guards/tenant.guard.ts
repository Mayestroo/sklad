import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

/**
 * Guard that ensures a tenant context exists on the request.
 * Applied to all tenant-scoped routes.
 *
 * Note: In Module 1 (Auth), this will be enhanced to extract
 * tenant_id from the JWT token. For now, it reads from headers.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // In production (Module 1), tenant_id comes from JWT.
    // For development, allow X-Tenant-Id header.
    const tenantId = request.user?.tenantId || request.headers['x-tenant-id'];

    if (!tenantId) {
      return false;
    }

    request.tenantId = tenantId;
    return true;
  }
}
