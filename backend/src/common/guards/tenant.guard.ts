import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Guard that ensures a valid tenant context exists on the request.
 * Applied to all tenant-scoped routes.
 *
 * Enforces strict multi-tenant boundary security:
 * - Reads authenticated tenantId directly from the verified JWT user context.
 * - Does NOT allow unauthenticated or arbitrary tenant ID spoofing.
 * - For global super-admins, permits explicit tenant targeting via 'x-tenant-id' header.
 * - Unauthorized requests fail fast with 401/403.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User authentication context missing');
    }

    // 1. If the authenticated user has a valid tenantId in their token, that is authoritative.
    if (typeof user.tenantId === 'string' && user.tenantId.trim() !== '') {
      request.tenantId = user.tenantId.trim();
      return true;
    }

    // 2. If the user is a global SuperAdmin, allow specifying target tenant via X-Tenant-Id header.
    const roles: string[] = Array.isArray(user.roles) ? user.roles : [];
    const isSuperAdmin = roles.some(
      (r) => typeof r === 'string' && r.toLowerCase() === 'super_admin',
    );

    if (isSuperAdmin) {
      const headerTenant = request.headers['x-tenant-id'];
      if (typeof headerTenant === 'string' && headerTenant.trim() !== '') {
        request.tenantId = headerTenant.trim();
        return true;
      }
      throw new ForbiddenException(
        'Tenant context required: SuperAdmin must specify X-Tenant-Id header for tenant-scoped operations',
      );
    }

    // 3. Any other user without a valid tenantId is rejected.
    throw new ForbiddenException('Tenant context required');
  }
}
