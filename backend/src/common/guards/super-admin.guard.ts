import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { AppRequest } from '../auth/request-context';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User authentication context missing');
    }

    const roles: unknown[] = user.roles || [];
    const isSuperAdmin = roles.some(
      (r) => typeof r === 'string' && r.toLowerCase() === 'super_admin',
    );

    if (!isSuperAdmin) {
      throw new ForbiddenException('Superadmin privileges required');
    }

    return true;
  }
}
