/**
 * Jest manual mock for unit tests that run a service against a hand-written
 * Prisma mock which does not model other tenants (no `findMany` on every
 * referenced delegate). Opt in with
 *   jest.mock('<relative path>/common/prisma/assert-tenant-owned');
 * The check then always passes and records its calls. The real check is
 * covered by assert-tenant-owned.spec.ts and tenant-isolation.spec.ts.
 */
const actual = jest.requireActual<typeof import('../assert-tenant-owned')>(
  '../assert-tenant-owned',
);

export const TENANT_REF_MODELS = actual.TENANT_REF_MODELS;
export type TenantRefModel = import('../assert-tenant-owned').TenantRefModel;
export type TenantOwnedRefs = import('../assert-tenant-owned').TenantOwnedRefs;

export const assertTenantOwned = jest.fn(() => Promise.resolve());
