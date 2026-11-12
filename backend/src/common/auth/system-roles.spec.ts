import {
  PERMISSIONS,
  SYSTEM_ROLES,
  systemRolePermissionSlugs,
} from './permission-catalog';

/**
 * The role × permission matrix, pinned. Changing what a system role may do is a
 * business decision: update this table on purpose, never as a side effect.
 * (company_admin and super_admin also bypass PermissionsGuard entirely.)
 */
const MATRIX: Record<string, string[]> = {
  super_admin: PERMISSIONS.map((p) => p.slug),
  company_admin: PERMISSIONS.map((p) => p.slug).filter(
    (slug) => slug !== 'billing:edit',
  ),
  accountant: [
    'accounting:create',
    'accounting:delete',
    'accounting:edit',
    'accounting:view',
    'analytics:view',
    'dashboard:view',
    'inventory:view',
    'sales:view',
  ],
  warehouse_manager: [
    'dashboard:view',
    'inventory:create',
    'inventory:delete',
    'inventory:edit',
    'inventory:view',
    'sales:view',
  ],
  salesperson: [
    'dashboard:view',
    'inventory:view',
    'sales:create',
    'sales:delete',
    'sales:edit',
    'sales:view',
  ],
  cashier: [
    'dashboard:view',
    'finance:create',
    'finance:view',
    'sales:create',
    'sales:view',
  ],
  viewer: PERMISSIONS.filter((p) => p.action === 'VIEW').map((p) => p.slug),
};

describe('system roles', () => {
  it('defines exactly the pinned roles', () => {
    expect(SYSTEM_ROLES.map((r) => r.slug).sort()).toEqual(
      Object.keys(MATRIX).sort(),
    );
  });

  it.each(Object.entries(MATRIX))(
    '%s holds exactly its pinned permissions',
    (slug, expected) => {
      expect(systemRolePermissionSlugs(slug)).toEqual([...expected].sort());
    },
  );

  it('every role has a bilingual name', () => {
    for (const role of SYSTEM_ROLES) {
      expect(role.name.uz).toBeTruthy();
      expect(role.name.ru).toBeTruthy();
    }
  });
});
