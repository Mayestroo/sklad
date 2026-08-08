/**
 * Shared constants — Module names, permission slugs, system roles
 */

/** All application modules */
export const MODULES = {
  DASHBOARD: 'dashboard',
  INVENTORY: 'inventory',
  SALES: 'sales',
  ACCOUNTING: 'accounting',
  ANALYTICS: 'analytics',
  BILLING: 'billing',
  SETTINGS: 'settings',
  USERS: 'users',
} as const;

/** System role slugs */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  COMPANY_ADMIN: 'company_admin',
  ACCOUNTANT: 'accountant',
  WAREHOUSE_MANAGER: 'warehouse_manager',
  SALESPERSON: 'salesperson',
  VIEWER: 'viewer',
} as const;

/** Company status values */
export const COMPANY_STATUS = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BLOCKED: 'BLOCKED',
} as const;

/** Supported locales */
export const LOCALES = {
  UZ: 'uz',
  RU: 'ru',
} as const;

/** Default trial period in days */
export const TRIAL_PERIOD_DAYS = 14;

/** Uzbekistan VAT rate */
export const UZ_VAT_RATE = 12;
