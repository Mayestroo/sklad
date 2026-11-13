import { SupportedLocale } from './i18n';
import { Company, User } from './tenant';

export interface JwtPayload {
  sub: string;         // userId
  tenantId?: string | null;    // tenantId (optional for super_admin)
  email: string;       // email
  roles: string[];     // role slugs
  permissions: string[]; // permission slugs
  locale: SupportedLocale;
  isImpersonated?: boolean;
  impersonatedBy?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Answer of POST /auth/register (D3). The same for every request, whether
 * the email or company address is free or taken; what happened is said in
 * the email. The account is created by POST /auth/register/confirm.
 */
export interface RegistrationPendingResponse {
  status: 'CONFIRMATION_SENT';
}

export interface AuthResponse {
  user: {
    id: string;
    tenantId?: string | null;
    email: string;
    firstName: string;
    lastName: string;
    preferredLanguage: SupportedLocale;
    roles: string[];
    permissions: string[];
  };
  company?: {
    id: string;
    name: any;
    slug: string;
    status: string;
    defaultLanguage: string;
  } | null;
  tokens: AuthTokens;
  isImpersonated?: boolean;
  impersonatedBy?: string;
}
