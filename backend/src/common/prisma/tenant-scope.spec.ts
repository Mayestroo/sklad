import * as path from 'path';
import {
  readTenantModels,
  scanSource,
  scanTenantScope,
  type UnscopedQuery,
} from './tenant-scope-scan';

/**
 * Every Prisma read, update and delete on tenant-owned data must say which
 * tenant it is for (there is no automatic tenant scoping). This scans the
 * backend source and fails on any query on a tenant-owned model whose
 * `where` has no tenantId, unless it is listed below with the reason it is
 * cross-tenant by design.
 *
 * Fixing a failure: add the tenant to the `where` — `tenantId` on models
 * with the column, or a relation filter for child rows, e.g.
 * `{ receipt: { tenantId }, receiptId }` on PurchaseReceiptItem. Prisma
 * accepts these extra filters on update/delete/upsert unique wheres too.
 */

const BACKEND = path.join(__dirname, '..', '..', '..');

interface Allowed {
  file: string;
  /** `Class.method`, or `*` for every function in the file. */
  scope: string;
  /** `Model.op`, or `*`. */
  query: string;
  reason: string;
}

const ALLOWED: Allowed[] = [
  {
    file: 'src/common/guards/jwt.strategy.ts',
    scope: 'JwtStrategy.validate',
    query: 'User.findUnique',
    reason:
      'Loads the caller from a verified access token; the tenant comes from this row.',
  },
  {
    file: 'src/modules/auth/auth.service.ts',
    scope: 'AuthService.login',
    query: '*',
    reason:
      'Login finds the user by email before any tenant is known, then updates that row.',
  },
  {
    file: 'src/modules/auth/auth.service.ts',
    scope: 'AuthService.emailTaken',
    query: 'User.findFirst',
    reason:
      'Emails are unique across tenants; checked at sign-up before the tenant exists (D3).',
  },
  {
    file: 'src/modules/auth/auth.service.ts',
    scope: 'AuthService.refreshToken',
    query: 'User.findUnique',
    reason: 'The caller’s own row, by id from a verified refresh token.',
  },
  {
    file: 'src/modules/auth/auth.service.ts',
    scope: 'AuthService.getProfile',
    query: 'User.findUnique',
    reason: 'The caller’s own row, by id from the verified access token.',
  },
  {
    file: 'src/common/prisma/seed-helper.ts',
    scope: 'autoSeedIfEmpty',
    query: '*',
    reason: 'Seeds an empty database at startup; not reachable from a request.',
  },
  {
    file: 'src/modules/billing/webhooks/click-webhook.service.ts',
    scope: '*',
    query: '*',
    reason:
      'Click callbacks carry no tenant: the payment is found by our payment id after the signature check.',
  },
  {
    file: 'src/modules/billing/webhooks/payme-webhook.service.ts',
    scope: '*',
    query: '*',
    reason:
      'Payme callbacks carry no tenant: the payment is found by our payment id / Payme transaction id after Basic auth.',
  },
  {
    file: 'src/modules/billing/webhooks/subscription-payment-transitions.ts',
    scope: '*',
    query: '*',
    reason:
      'State transitions of a payment row the webhook already authenticated and loaded.',
  },
  {
    file: 'src/modules/super-admin/super-admin.service.ts',
    scope: '*',
    query: '*',
    reason:
      'Super-admin routes (JwtAuthGuard + SuperAdminGuard) work across tenants by design.',
  },
];

const isAllowed = (q: UnscopedQuery, a: Allowed) =>
  q.file === a.file &&
  (a.scope === '*' || a.scope === q.scope) &&
  (a.query === '*' || a.query === `${q.model}.${q.op}`);

describe('tenant scoping of Prisma queries', () => {
  const found = scanTenantScope(BACKEND, ['src']);

  it('every query on tenant-owned data filters by tenant', () => {
    const offending = found
      .filter((q) => !ALLOWED.some((a) => isAllowed(q, a)))
      .map(
        (q) =>
          `${q.file}:${q.line} ${q.model}.${q.op} in ${q.scope} (${q.kind})`,
      );
    expect(offending).toEqual([]);
  });

  it('has no stale exceptions', () => {
    const stale = ALLOWED.filter((a) => !found.some((q) => isAllowed(q, a)));
    expect(stale).toEqual([]);
  });
});

describe('tenant scope scanner', () => {
  const info = readTenantModels(path.join(BACKEND, 'prisma', 'schema.prisma'));
  const scan = (body: string) =>
    scanSource(
      `async function f(tenantId, id, x) { ${body} }`,
      'f.ts',
      info,
    ).map((q) => `${q.model}.${q.op}:${q.kind}`);

  it('flags queries without a tenant', () => {
    expect(
      scan('await db.salesInvoice.update({ where: { id }, data: {} });'),
    ).toEqual(['SalesInvoice.update:unscoped']);
    expect(scan('await db.product.findMany();')).toEqual([
      'Product.findMany:no-where',
    ]);
    expect(
      scan(
        'await db.purchaseReceiptItem.findMany({ where: { receiptId: id } });',
      ),
    ).toEqual(['PurchaseReceiptItem.findMany:unscoped']);
    expect(
      scan(
        'await db.counterpartyBalance.findUnique({ where: { counterpartyId_currency: { counterpartyId: id, currency: x } } });',
      ),
    ).toEqual(['CounterpartyBalance.findUnique:unscoped']);
    expect(
      scan(
        'await db.role.findMany({ where: { OR: [{ tenantId }, { slug: x }] } });',
      ),
    ).toEqual(['Role.findMany:unscoped']);
  });

  it('accepts every way of scoping', () => {
    expect(
      scan(`
        await db.salesInvoice.update({ where: { id, tenantId }, data: {} });
        await db.stockLevel.findUnique({ where: { tenantId_warehouseId_productId: x } });
        await db.purchaseReceiptItem.findMany({ where: { receipt: { tenantId }, receiptId: id } });
        await db.productionMaterialBatch.findMany({ where: { batch: { is: { tenantId } } } });
        await db.role.findMany({ where: { OR: [{ tenantId }, { tenantId: null }] } });
        await db.product.findMany({ where: { AND: [{ tenantId }, { id }] } });
        const where = { tenantId, isActive: true };
        await db.product.findMany({ where });
        await db.product.count({ where: { ...where, id } });
        await db.company.findUnique({ where: { id: tenantId } });
      `),
    ).toEqual([]);
  });

  it('reports filters it cannot follow as dynamic', () => {
    expect(scan('await db.product.findMany({ where: x });')).toEqual([
      'Product.findMany:dynamic',
    ]);
  });
});
