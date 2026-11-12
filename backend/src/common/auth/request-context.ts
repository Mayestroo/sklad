import type { Request } from 'express';
import type { Company } from '@prisma/client';

/** What `JwtStrategy.validate` attaches to `request.user`. */
export interface AuthenticatedUser {
  id: string;
  tenantId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  roles: string[];
  permissions: string[];
  company: Company | null;
}

/**
 * The Express request as the guards and decorators see it. `user` is set by
 * `JwtAuthGuard`, `tenantId` by `TenantGuard`, `locale` by `I18nMiddleware`.
 * `user` stays loosely typed on purpose: guards re-check its shape at runtime.
 */
export interface AppRequest extends Request {
  user?: Partial<AuthenticatedUser>;
  tenantId?: string;
  locale?: string;
}
