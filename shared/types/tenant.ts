/**
 * Shared types — Tenant (Company), User, Role interfaces
 */

import { TranslatableField, SupportedLocale } from './i18n';

// ─── Company / Tenant ─────────────────────────────────────────

export type CompanyStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';

export interface Company {
  id: string;
  name: TranslatableField;
  slug: string;
  defaultLanguage: SupportedLocale;
  status: CompanyStatus;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── User ─────────────────────────────────────────────────────

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: SupportedLocale;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithRoles extends User {
  roles: Role[];
}

// ─── RBAC ─────────────────────────────────────────────────────

export type PermissionAction = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE';

export interface Role {
  id: string;
  tenantId: string | null;
  name: TranslatableField;
  slug: string;
  isSystemRole: boolean;
}

export interface Permission {
  id: string;
  module: string;
  action: PermissionAction;
  slug: string;
  description: TranslatableField | null;
}

// ─── Branch & Warehouse ───────────────────────────────────────

export interface Branch {
  id: string;
  tenantId: string;
  name: TranslatableField;
  address: string | null;
  isMain: boolean;
}

export interface Warehouse {
  id: string;
  tenantId: string;
  branchId: string | null;
  name: TranslatableField;
}

// ─── Financial References ─────────────────────────────────────

export interface Currency {
  id: string;
  code: string;
  name: TranslatableField;
  symbol: string;
  isDefault: boolean;
}

export interface TaxRate {
  id: string;
  tenantId: string | null;
  name: TranslatableField;
  rate: number;
  code: string;
  isDefault: boolean;
}

// ─── Audit ────────────────────────────────────────────────────

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}
