import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanDirectory, scanFile } from './request-reference-scan';

/**
 * Guard for the second tenant-isolation sweep (docs/tenant-isolation-sweep.md):
 * a service method that reads ids from a request DTO must call
 * `assertTenantOwned` (directly or through a same-class helper), or be listed
 * here with the reason it is safe. New code that writes a request id without
 * the check fails this test.
 */

const READ_FILTER =
  'Read-only list filter: the query is scoped by tenantId, so a foreign id matches nothing';
const INTERNAL =
  'Internal helper: called with ids already loaded from tenant-scoped rows, never straight from a request';

const ALLOWLIST: Record<string, string> = {
  'JournalService.createJournalEntry':
    'Internal writer for automatic postings (accounts resolved by code within the tenant); the user route goes through createManualEntry, which checks',
  'AuditService.logAction': INTERNAL,
  'FinanceService.listTransactions': READ_FILTER,
  'FinanceService.resolveSettlementContext':
    'Checks counterparty with findFirst({ id, tenantId }) and loads the source document within the tenant',
  'FinanceService.createTransfer':
    'Both cash accounts are loaded with findFirst({ id, tenantId, isActive })',
  'FinanceService.reverseCounterpartySettlement': INTERNAL,
  'FinanceService.reverseLegacyDocumentAllocation': INTERNAL,
  'FinanceService.reversePostedTransaction': INTERNAL,
  'StockReservationService.reserveStockForOrder': INTERNAL,
  'ProductionService.createRecipe':
    'Product and materials are loaded with tenantId and their count compared with the request',
  'ProductionService.createDocument':
    'Recipe (preview), warehouse (requireWarehouse) and responsible user (requireTenantUser) are each loaded with tenantId',
  'ProductionService.findDocuments': READ_FILTER,
  'ProductionService.updateActualMaterials':
    'Product ids must equal the materials of the tenant-scoped document',
  'ProductionService.consumeMaterial': INTERNAL,
  'AdditionalExpensesService.calculateAllocationPreview':
    'Receipt is loaded with tenantId; selected item ids are intersected with that receipt’s items',
  'AdditionalExpensesService.findAll': READ_FILTER,
  'PurchasesService.findAllReceipts': READ_FILTER,
  'PurchasesService.payPurchaseReceipt':
    'Cash account is loaded with findFirst({ id, tenantId, isActive })',
  'PurchasesService.executeReturnPostingInternal': INTERNAL,
  'PurchasesService.findAllReturns': READ_FILTER,
  'SalesInvoicesService.findAll': READ_FILTER,
  'SalesInvoicesService.executePostReturn': INTERNAL,
  'SalesInvoicesService.bulkSetPrices':
    'Price list is loaded with tenantId and products are checked by assertTenantProducts',
  'SalesInvoicesService.resolveProductPrice':
    'Read-only lookup scoped by tenantId',
  'SalesOrdersService.findAll': READ_FILTER,
  'SalesOrdersService.findProductionOrders': READ_FILTER,
  'PaymentsService.registerPayment':
    'Counterparty, invoice/order (matched to that counterparty) and cash account are each loaded with tenantId',
  'ServicesService.calculateItem': 'Pure calculation, no database access',
  'ServicesService.findAll': READ_FILTER,
  'CounterpartySettlementService.assertSameMovement':
    'Compares a stored movement with a replayed one; writes nothing',
  'ReconciliationService.sumExistingAllocations': INTERNAL,
  'ReconciliationService.allocationCandidates': INTERNAL,
  'ReconciliationService.buildProjection': INTERNAL,
  'ReconciliationService.findProjectionDifferences': INTERNAL,
  'SettlementAllocationService.reverseAllocation': INTERNAL,
  'SettlementAllocationService.assertSameAllocation':
    'Compares a stored allocation with a replayed one; writes nothing',
};

const MODULES = path.join(__dirname, '..', '..', 'modules');

describe('request ids are checked against the caller’s tenant', () => {
  const findings = scanDirectory(MODULES);

  it('every service method that reads ids from a request checks them or is allowlisted', () => {
    const unchecked = findings
      .filter((f) => !f.checked && !(f.method in ALLOWLIST))
      .map((f) => `${f.file}:${f.line} ${f.method} [${f.ids.join(', ')}]`);
    expect(unchecked).toEqual([]);
  });

  it('the allowlist has no stale entries', () => {
    const uncheckedMethods = new Set(
      findings.filter((f) => !f.checked).map((f) => f.method),
    );
    const stale = Object.keys(ALLOWLIST).filter(
      (method) => !uncheckedMethods.has(method),
    );
    expect(stale).toEqual([]);
  });

  describe('scanner', () => {
    const scan = (source: string) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refscan-'));
      const file = path.join(dir, 'sample.service.ts');
      fs.writeFileSync(file, source);
      try {
        return scanFile(file, dir);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };

    it('flags header and nested line ids read from a DTO without a check', () => {
      const [finding] = scan(`
        class SampleService {
          async create(tenantId: string, dto: CreateThingDto) {
            for (const line of dto.lines) use(line.accountId);
            return db.thing.create({ data: {
              warehouseId: dto.warehouseId,
              items: dto.items.map((item) => ({ productId: item.productId })),
            } });
          }
        }`);
      expect(finding).toMatchObject({
        method: 'SampleService.create',
        ids: ['accountId', 'productId', 'warehouseId'],
        checked: false,
      });
    });

    it('accepts assertTenantOwned, directly or through a same-class helper', () => {
      const findings = scan(`
        class SampleService {
          async direct(tenantId: string, dto: Partial<CreateThingDto>) {
            await assertTenantOwned(db, tenantId, { warehouse: dto.warehouseId });
          }
          async viaHelper(tenantId: string, dto: { counterpartyId?: string }) {
            await this.checkRefs(tenantId, dto);
            return dto.counterpartyId;
          }
          private checkRefs(tenantId: string, refs: unknown) {
            return assertTenantOwned(db, tenantId, refs as never);
          }
        }`);
      expect(findings.map((f) => [f.method, f.checked] as const)).toEqual([
        ['SampleService.direct', true],
        ['SampleService.viaHelper', true],
      ]);
    });

    it('ignores tenantId and parameters that are not request input', () => {
      expect(
        scan(`
          class SampleService {
            async post(tenantId: string, id: string, order: SalesOrder) {
              return order.warehouseId + tenantId;
            }
            async load(dto: CreateThingDto) { return dto.tenantId; }
          }`),
      ).toEqual([]);
    });
  });
});
