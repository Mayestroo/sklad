/**
 * Role checking utilities for authorization invariants
 */

export function isAdmin(roles: string[]): boolean {
  if (!roles || !Array.isArray(roles)) return false;
  return roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r.toUpperCase()));
}

export function isManagerOrAbove(roles: string[]): boolean {
  if (!roles || !Array.isArray(roles)) return false;
  return roles.some((r) => ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(r.toUpperCase()));
}

export function isWarehouseOrAbove(roles: string[]): boolean {
  if (!roles || !Array.isArray(roles)) return false;
  return roles.some((r) =>
    [
      'ADMIN',
      'SUPER_ADMIN',
      'MANAGER',
      'WAREHOUSE',
      'WAREHOUSE_MANAGER',
      'STOREKEEPER',
      'OMBORCHI',
    ].includes(r.toUpperCase()),
  );
}
