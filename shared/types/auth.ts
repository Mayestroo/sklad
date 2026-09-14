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
