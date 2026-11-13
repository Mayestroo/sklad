# Tenant-isolation sweep (2026-11-13)

Every Prisma read, update and delete on a tenant-owned model whose `where`
had no tenant filter, found by `backend/src/common/prisma/tenant-scope-scan.ts`
over `backend/src`, `backend/scripts` and `backend/prisma`. Line numbers are as
of commit `c4ac1eb`, before the fix. A model is tenant-owned when it has a
`tenantId` column or belongs to such a model (e.g. `PurchaseReceiptItem` →
`PurchaseReceipt`).

"Fixed" sites now carry `tenantId` (or `<parent>: { tenantId }` on child rows).
`tenant-scope.spec.ts` fails on any new unscoped query; the "By design" rows
are its allowlist, each with the reason.

One more leak was found outside this list, because it is a foreign key taken
from the request rather than a missing filter: `SalesInvoicesService.upsertProductPrice`
and `bulkSetPrices` accepted another tenant's `productId` and returned that
product (name, SKU, cost) in the response and in later price-list reads. Both
now check the products belong to the caller.

| # | File:line | Model.op | Function | Reachable from a request | Outcome |
|---|---|---|---|---|---|
| 1 | `src/common/guards/jwt.strategy.ts:23` | User.findUnique | JwtStrategy.validate | yes | By design: caller's own row from a verified token |
| 2 | `src/common/prisma/seed-helper.ts:11` | User.count (no where) | autoSeedIfEmpty | no | Not reachable: startup seed of an empty database |
| 3 | `src/common/prisma/seed-helper.ts:120` | RolePermission.findFirst | autoSeedIfEmpty | no | Not reachable: startup seed of an empty database |
| 4 | `src/common/prisma/seed-helper.ts:146` | User.findFirst | autoSeedIfEmpty | no | Not reachable: startup seed of an empty database |
| 5 | `src/common/prisma/seed-helper.ts:170` | User.update | autoSeedIfEmpty | no | Not reachable: startup seed of an empty database |
| 6 | `modules/auth/auth.service.ts:44` | User.findFirst | AuthService.registerCompany | yes | By design: identity lookup before a tenant is known |
| 7 | `modules/auth/auth.service.ts:150` | User.findFirst | AuthService.login | yes | By design: identity lookup before a tenant is known |
| 8 | `modules/auth/auth.service.ts:191` | User.update | AuthService.login | yes | By design: identity lookup before a tenant is known |
| 9 | `modules/auth/auth.service.ts:237` | User.findUnique | AuthService.refreshToken | yes | By design: identity lookup before a tenant is known |
| 10 | `modules/auth/auth.service.ts:297` | User.findUnique | AuthService.getProfile | yes | By design: identity lookup before a tenant is known |
| 11 | `modules/billing/webhooks/click-webhook.service.ts:140` | SubscriptionPayment.updateMany | ClickWebhookService.prepare | yes | By design: authenticated provider callback, no tenant in the request |
| 12 | `modules/billing/webhooks/click-webhook.service.ts:205` | SubscriptionPayment.findFirst | ClickWebhookService.findPayment | yes | By design: authenticated provider callback, no tenant in the request |
| 13 | `modules/billing/webhooks/payme-webhook.service.ts:181` | SubscriptionPayment.findFirst | PaymeWebhookService.payableOrder | yes | By design: authenticated provider callback, no tenant in the request |
| 14 | `modules/billing/webhooks/payme-webhook.service.ts:215` | SubscriptionPayment.updateMany | PaymeWebhookService.create | yes | By design: authenticated provider callback, no tenant in the request |
| 15 | `modules/billing/webhooks/payme-webhook.service.ts:294` | SubscriptionPayment.findMany | PaymeWebhookService.statement | yes | By design: authenticated provider callback, no tenant in the request |
| 16 | `modules/billing/webhooks/payme-webhook.service.ts:313` | SubscriptionPayment.findFirst | PaymeWebhookService.findTransaction | yes | By design: authenticated provider callback, no tenant in the request |
| 17 | `modules/billing/webhooks/subscription-payment-transitions.ts:32` | SubscriptionPayment.updateMany | performSubscriptionPayment | yes | By design: authenticated provider callback, no tenant in the request |
| 18 | `modules/billing/webhooks/subscription-payment-transitions.ts:44` | Subscription.update | performSubscriptionPayment | yes | By design: authenticated provider callback, no tenant in the request |
| 19 | `modules/billing/webhooks/subscription-payment-transitions.ts:68` | SubscriptionPayment.updateMany | cancelSubscriptionPayment | yes | By design: authenticated provider callback, no tenant in the request |
| 20 | `modules/billing/webhooks/subscription-payment-transitions.ts:83` | Subscription.update | cancelSubscriptionPayment | yes | By design: authenticated provider callback, no tenant in the request |
| 21 | `modules/finance/finance.service.ts:846` | CashAccount.update | FinanceService.createIncome | yes | Fixed: tenant filter added |
| 22 | `modules/finance/finance.service.ts:975` | CashAccount.update | FinanceService.createExpense | yes | Fixed: tenant filter added |
| 23 | `modules/finance/finance.service.ts:1062` | SalesInvoice.update | FinanceService.updateSettlementTargetPaidAmount | yes | Fixed: tenant filter added |
| 24 | `modules/finance/finance.service.ts:1089` | SalesOrder.update | FinanceService.updateSettlementTargetPaidAmount | yes | Fixed: tenant filter added |
| 25 | `modules/finance/finance.service.ts:1111` | PurchaseReceipt.update | FinanceService.updateSettlementTargetPaidAmount | yes | Fixed: tenant filter added |
| 26 | `modules/finance/finance.service.ts:1131` | ServiceAct.update | FinanceService.updateSettlementTargetPaidAmount | yes | Fixed: tenant filter added |
| 27 | `modules/finance/finance.service.ts:1146` | SettlementAllocation.findMany | FinanceService.updateSettlementTargetPaidAmount | yes | Fixed: tenant filter added |
| 28 | `modules/finance/finance.service.ts:1157` | AdditionalExpense.update | FinanceService.updateSettlementTargetPaidAmount | yes | Fixed: tenant filter added |
| 29 | `modules/finance/finance.service.ts:1343` | CounterpartyBalance.findUnique | FinanceService.assertCreditAvailable | yes | Fixed: tenant filter added |
| 30 | `modules/finance/finance.service.ts:1394` | SalesInvoice.update | FinanceService.allocateAndUpdateTarget | yes | Fixed: tenant filter added |
| 31 | `modules/finance/finance.service.ts:1423` | SalesOrder.update | FinanceService.allocateAndUpdateTarget | yes | Fixed: tenant filter added |
| 32 | `modules/finance/finance.service.ts:1444` | PurchaseReceipt.update | FinanceService.allocateAndUpdateTarget | yes | Fixed: tenant filter added |
| 33 | `modules/finance/finance.service.ts:1463` | ServiceAct.update | FinanceService.allocateAndUpdateTarget | yes | Fixed: tenant filter added |
| 34 | `modules/finance/finance.service.ts:1477` | SettlementAllocation.findMany | FinanceService.allocateAndUpdateTarget | yes | Fixed: tenant filter added |
| 35 | `modules/finance/finance.service.ts:1489` | AdditionalExpense.update | FinanceService.allocateAndUpdateTarget | yes | Fixed: tenant filter added |
| 36 | `modules/finance/finance.service.ts:1841` | CashAccount.update | FinanceService.createTransfer | yes | Fixed: tenant filter added |
| 37 | `modules/finance/finance.service.ts:1847` | CashAccount.update | FinanceService.createTransfer | yes | Fixed: tenant filter added |
| 38 | `modules/finance/finance.service.ts:1907` | CounterpartySettlementEntry.findUnique | FinanceService.reverseCounterpartySettlement | yes | Fixed: tenant filter added |
| 39 | `modules/finance/finance.service.ts:1937` | SettlementAllocation.findMany | FinanceService.reverseCounterpartySettlement | yes | Fixed: tenant filter added |
| 40 | `modules/finance/finance.service.ts:2065` | CashAccount.findUnique | FinanceService.reversePostedTransaction | yes | Fixed: tenant filter added |
| 41 | `modules/finance/finance.service.ts:2073` | CashAccount.update | FinanceService.reversePostedTransaction | yes | Fixed: tenant filter added |
| 42 | `modules/finance/finance.service.ts:2089` | CashAccount.update | FinanceService.reversePostedTransaction | yes | Fixed: tenant filter added |
| 43 | `modules/finance/finance.service.ts:2105` | CashAccount.findUnique | FinanceService.reversePostedTransaction | yes | Fixed: tenant filter added |
| 44 | `modules/finance/finance.service.ts:2113` | CashAccount.update | FinanceService.reversePostedTransaction | yes | Fixed: tenant filter added |
| 45 | `modules/finance/finance.service.ts:2119` | CashAccount.update | FinanceService.reversePostedTransaction | yes | Fixed: tenant filter added |
| 46 | `modules/finance/finance.service.ts:2173` | FinanceTransaction.update | FinanceService.updateTransaction | yes | Fixed: tenant filter added |
| 47 | `modules/finance/finance.service.ts:2204` | FinanceTransaction.update | FinanceService.deleteTransaction | yes | Fixed: tenant filter added |
| 48 | `modules/finance/finance.service.ts:2223` | FinanceTransaction.update | FinanceService.restoreTransaction | yes | Fixed: tenant filter added |
| 49 | `modules/finance/finance.service.ts:2232` | TransactionType.findMany | FinanceService.getTransactionTypes | yes | Fixed: tenant filter added |
| 50 | `modules/fixed-assets/fixed-assets.service.ts:105` | FixedAsset.findUnique | FixedAssetsService.update | yes | Fixed: tenant filter added |
| 51 | `modules/fixed-assets/fixed-assets.service.ts:119` | FixedAsset.update | FixedAssetsService.update | yes | Fixed: tenant filter added |
| 52 | `modules/fixed-assets/fixed-assets.service.ts:127` | FixedAsset.delete | FixedAssetsService.delete | yes | Fixed: tenant filter added |
| 53 | `modules/inventory/categories/categories.service.ts:52` | Category.update | CategoriesService.update | yes | Fixed: tenant filter added |
| 54 | `modules/inventory/categories/categories.service.ts:77` | Product.updateMany | CategoriesService.delete | yes | Fixed: tenant filter added |
| 55 | `modules/inventory/categories/categories.service.ts:83` | Category.updateMany | CategoriesService.delete | yes | Fixed: tenant filter added |
| 56 | `modules/inventory/categories/categories.service.ts:88` | Category.delete | CategoriesService.delete | yes | Fixed: tenant filter added |
| 57 | `modules/inventory/documents/inventory-documents.service.ts:124` | InventoryDocumentItem.update | InventoryDocumentsService.createAndPostDocument | yes | Fixed: tenant filter added |
| 58 | `modules/inventory/documents/inventory-documents.service.ts:150` | InventoryDocument.update | InventoryDocumentsService.createAndPostDocument | yes | Fixed: tenant filter added |
| 59 | `modules/inventory/fifo/fifo-batches.ts:193` | ProductBatch.updateMany | consumeFifoBatches | yes | Fixed: tenant filter added |
| 60 | `modules/inventory/fifo/fifo-batches.ts:232` | ProductBatch.update | restoreBatchConsumptions | yes | Fixed: tenant filter added |
| 61 | `modules/inventory/products/products.service.ts:372` | Product.update | ProductsService.update | yes | Fixed: tenant filter added |
| 62 | `modules/inventory/products/products.service.ts:418` | PurchaseReceiptItem.count | ProductsService.delete | yes | Fixed: tenant filter added |
| 63 | `modules/inventory/products/products.service.ts:419` | SalesInvoiceItem.count | ProductsService.delete | yes | Fixed: tenant filter added |
| 64 | `modules/inventory/products/products.service.ts:420` | ProductBatch.count | ProductsService.delete | yes | Fixed: tenant filter added |
| 65 | `modules/inventory/products/products.service.ts:427` | Product.update | ProductsService.delete | yes | Fixed: tenant filter added |
| 66 | `modules/inventory/products/products.service.ts:439` | StockLevel.deleteMany | ProductsService.delete | yes | Fixed: tenant filter added |
| 67 | `modules/inventory/products/products.service.ts:440` | ProductPrice.deleteMany | ProductsService.delete | yes | Fixed: tenant filter added |
| 68 | `modules/inventory/products/products.service.ts:441` | Product.delete | ProductsService.delete | yes | Fixed: tenant filter added |
| 69 | `modules/inventory/stock-reservation/stock-reservation.service.ts:120` | SalesOrderItem.update | StockReservationService.reserveStockForOrder | yes | Fixed: tenant filter added |
| 70 | `modules/inventory/stock-reservation/stock-reservation.service.ts:176` | SalesOrderItem.updateMany | StockReservationService.releaseOrderReservations | yes | Fixed: tenant filter added |
| 71 | `modules/inventory/stock-reservation/stock-reservation.service.ts:226` | StockReservation.delete | StockReservationService.consumeReservation | yes | Fixed: tenant filter added |
| 72 | `modules/inventory/stock-reservation/stock-reservation.service.ts:230` | StockReservation.update | StockReservationService.consumeReservation | yes | Fixed: tenant filter added |
| 73 | `modules/inventory/transfers/stock-transfers.service.ts:138` | StockTransfer.update | StockTransfersService.shipTransfer | yes | Fixed: tenant filter added |
| 74 | `modules/inventory/transfers/stock-transfers.service.ts:271` | StockTransfer.update | StockTransfersService.receiveTransfer | yes | Fixed: tenant filter added |
| 75 | `modules/inventory/transfers/stock-transfers.service.ts:339` | StockTransferItem.deleteMany | StockTransfersService.deleteTransfer | yes | Fixed: tenant filter added |
| 76 | `modules/inventory/transfers/stock-transfers.service.ts:343` | StockTransfer.delete | StockTransfersService.deleteTransfer | yes | Fixed: tenant filter added |
| 77 | `modules/opening-balances/opening-balances.service.ts:443` | OpeningBalanceDocument.update | OpeningBalancesService.updateLines | yes | Fixed: tenant filter added |
| 78 | `modules/opening-balances/opening-balances.service.ts:506` | OpeningBalanceDocument.update | OpeningBalancesService.balanceEquity | yes | Fixed: tenant filter added |
| 79 | `modules/opening-balances/opening-balances.service.ts:611` | CashAccount.update | OpeningBalancesService.post | yes | Fixed: tenant filter added |
| 80 | `modules/opening-balances/opening-balances.service.ts:722` | FixedAsset.update | OpeningBalancesService.post | yes | Fixed: tenant filter added |
| 81 | `modules/opening-balances/opening-balances.service.ts:873` | OpeningBalanceDocument.update | OpeningBalancesService.post | yes | Fixed: tenant filter added |
| 82 | `modules/opening-balances/opening-balances.service.ts:947` | CashAccount.findUnique | OpeningBalancesService.unpost | yes | Fixed: tenant filter added |
| 83 | `modules/opening-balances/opening-balances.service.ts:969` | CashAccount.update | OpeningBalancesService.unpost | yes | Fixed: tenant filter added |
| 84 | `modules/opening-balances/opening-balances.service.ts:1051` | JournalLine.deleteMany | OpeningBalancesService.unpost | yes | Fixed: tenant filter added |
| 85 | `modules/opening-balances/opening-balances.service.ts:1052` | JournalEntry.delete | OpeningBalancesService.unpost | yes | Fixed: tenant filter added |
| 86 | `modules/opening-balances/opening-balances.service.ts:1056` | OpeningBalanceDocument.update | OpeningBalancesService.unpost | yes | Fixed: tenant filter added |
| 87 | `modules/opening-balances/opening-balances.service.ts:1084` | OpeningBalanceDocument.delete | OpeningBalancesService.delete | yes | Fixed: tenant filter added |
| 88 | `modules/production/production.service.ts:152` | ProductionRecipe.update | ProductionService.updateRecipe | yes | Fixed: tenant filter added |
| 89 | `modules/production/production.service.ts:527` | ProductionMaterialBatch.findMany | ProductionService.updateActualMaterials | yes | Fixed: tenant filter added |
| 90 | `modules/production/production.service.ts:541` | ProductionMaterialLine.update | ProductionService.updateActualMaterials | yes | Fixed: tenant filter added |
| 91 | `modules/production/production.service.ts:556` | ProductionMaterialLine.findMany | ProductionService.updateActualMaterials | yes | Fixed: tenant filter added |
| 92 | `modules/production/production.service.ts:562` | ProductionDocument.update | ProductionService.updateActualMaterials | yes | Fixed: tenant filter added |
| 93 | `modules/production/production.service.ts:598` | ProductionDocument.update | ProductionService.markReady | yes | Fixed: tenant filter added |
| 94 | `modules/production/production.service.ts:675` | Product.update | ProductionService.complete | yes | Fixed: tenant filter added |
| 95 | `modules/production/production.service.ts:683` | ProductionDocument.update | ProductionService.complete | yes | Fixed: tenant filter added |
| 96 | `modules/production/production.service.ts:810` | ProductionMaterialBatch.upsert | ProductionService.consumeMaterial | yes | Fixed: tenant filter added |
| 97 | `modules/production/production.service.ts:834` | StockLevel.updateMany | ProductionService.consumeMaterial | yes | Fixed: tenant filter added |
| 98 | `modules/production/production.service.ts:866` | ProductBatch.update | ProductionService.restoreMaterialQuantity | yes | Fixed: tenant filter added |
| 99 | `modules/production/production.service.ts:893` | ProductionMaterialBatch.delete | ProductionService.restoreMaterialQuantity | yes | Fixed: tenant filter added |
| 100 | `modules/production/production.service.ts:897` | ProductionMaterialBatch.update | ProductionService.restoreMaterialQuantity | yes | Fixed: tenant filter added |
| 101 | `modules/purchases/additional-expenses.service.ts:296` | AdditionalExpenseItem.deleteMany | AdditionalExpensesService.updateDraft | yes | Fixed: tenant filter added |
| 102 | `modules/purchases/additional-expenses.service.ts:300` | AdditionalExpense.update | AdditionalExpensesService.updateDraft | yes | Fixed: tenant filter added |
| 103 | `modules/purchases/additional-expenses.service.ts:374` | AdditionalExpenseItem.deleteMany | AdditionalExpensesService.deleteDraft | yes | Fixed: tenant filter added |
| 104 | `modules/purchases/additional-expenses.service.ts:378` | AdditionalExpense.delete | AdditionalExpensesService.deleteDraft | yes | Fixed: tenant filter added |
| 105 | `modules/purchases/additional-expenses.service.ts:673` | ProductBatch.update | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 106 | `modules/purchases/additional-expenses.service.ts:680` | PurchaseReceiptItem.findFirst | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 107 | `modules/purchases/additional-expenses.service.ts:687` | PurchaseReceiptItem.update | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 108 | `modules/purchases/additional-expenses.service.ts:694` | Product.update | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 109 | `modules/purchases/additional-expenses.service.ts:723` | SalesInvoiceItem.update | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 110 | `modules/purchases/additional-expenses.service.ts:733` | SalesInvoiceItem.findMany | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 111 | `modules/purchases/additional-expenses.service.ts:743` | SalesInvoice.findUnique | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 112 | `modules/purchases/additional-expenses.service.ts:749` | SalesInvoice.update | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 113 | `modules/purchases/additional-expenses.service.ts:761` | AdditionalExpenseItem.update | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 114 | `modules/purchases/additional-expenses.service.ts:772` | PurchaseReceipt.update | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 115 | `modules/purchases/additional-expenses.service.ts:807` | CashAccount.update | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 116 | `modules/purchases/additional-expenses.service.ts:934` | AdditionalExpense.update | AdditionalExpensesService.postExpense | yes | Fixed: tenant filter added |
| 117 | `modules/purchases/additional-expenses.service.ts:1032` | ProductBatch.update | AdditionalExpensesService.cancelExpense | yes | Fixed: tenant filter added |
| 118 | `modules/purchases/additional-expenses.service.ts:1038` | Product.update | AdditionalExpensesService.cancelExpense | yes | Fixed: tenant filter added |
| 119 | `modules/purchases/additional-expenses.service.ts:1071` | SalesInvoiceItem.update | AdditionalExpensesService.cancelExpense | yes | Fixed: tenant filter added |
| 120 | `modules/purchases/additional-expenses.service.ts:1081` | SalesInvoiceItem.findMany | AdditionalExpensesService.cancelExpense | yes | Fixed: tenant filter added |
| 121 | `modules/purchases/additional-expenses.service.ts:1091` | SalesInvoice.findUnique | AdditionalExpensesService.cancelExpense | yes | Fixed: tenant filter added |
| 122 | `modules/purchases/additional-expenses.service.ts:1097` | SalesInvoice.update | AdditionalExpensesService.cancelExpense | yes | Fixed: tenant filter added |
| 123 | `modules/purchases/additional-expenses.service.ts:1110` | PurchaseReceipt.update | AdditionalExpensesService.cancelExpense | yes | Fixed: tenant filter added |
| 124 | `modules/purchases/additional-expenses.service.ts:1143` | AdditionalExpense.update | AdditionalExpensesService.cancelExpense | yes | Fixed: tenant filter added |
| 125 | `modules/purchases/purchases.service.ts:452` | PurchaseReceiptItem.deleteMany | PurchasesService.updateReceipt | yes | Fixed: tenant filter added |
| 126 | `modules/purchases/purchases.service.ts:456` | PurchaseReceipt.update | PurchasesService.updateReceipt | yes | Fixed: tenant filter added |
| 127 | `modules/purchases/purchases.service.ts:532` | StockLevel.update | PurchasesService.postReceipt | yes | Fixed: tenant filter added |
| 128 | `modules/purchases/purchases.service.ts:578` | Product.update | PurchasesService.postReceipt | yes | Fixed: tenant filter added |
| 129 | `modules/purchases/purchases.service.ts:748` | PurchaseReceipt.update | PurchasesService.postReceipt | yes | Fixed: tenant filter added |
| 130 | `modules/purchases/purchases.service.ts:843` | StockLevel.update | PurchasesService.unpostReceipt | yes | Fixed: tenant filter added |
| 131 | `modules/purchases/purchases.service.ts:851` | ProductBatch.deleteMany | PurchasesService.unpostReceipt | yes | Fixed: tenant filter added |
| 132 | `modules/purchases/purchases.service.ts:888` | PurchaseReceipt.update | PurchasesService.unpostReceipt | yes | Fixed: tenant filter added |
| 133 | `modules/purchases/purchases.service.ts:999` | CashAccount.update | PurchasesService.payPurchaseReceipt | yes | Fixed: tenant filter added |
| 134 | `modules/purchases/purchases.service.ts:1055` | PurchaseReceipt.update | PurchasesService.payPurchaseReceipt | yes | Fixed: tenant filter added |
| 135 | `modules/purchases/purchases.service.ts:1178` | PurchaseReceipt.delete | PurchasesService.deleteReceipt | yes | Fixed: tenant filter added |
| 136 | `modules/purchases/purchases.service.ts:1224` | PurchaseExpense.findMany | PurchasesService.addExpense | yes | Fixed: tenant filter added |
| 137 | `modules/purchases/purchases.service.ts:1281` | PurchaseReceiptItem.update | PurchasesService.addExpense | yes | Fixed: tenant filter added |
| 138 | `modules/purchases/purchases.service.ts:1291` | ProductBatch.updateMany | PurchasesService.addExpense | yes | Fixed: tenant filter added |
| 139 | `modules/purchases/purchases.service.ts:1305` | PurchaseReceipt.update | PurchasesService.addExpense | yes | Fixed: tenant filter added |
| 140 | `modules/purchases/purchases.service.ts:1655` | StockLevel.update | PurchasesService.executeReturnPostingInternal | yes | Fixed: tenant filter added |
| 141 | `modules/purchases/purchases.service.ts:1679` | PurchaseReceiptItem.update | PurchasesService.executeReturnPostingInternal | yes | Fixed: tenant filter added |
| 142 | `modules/purchases/purchases.service.ts:1739` | PurchaseReceiptItem.findMany | PurchasesService.executeReturnPostingInternal | yes | Fixed: tenant filter added |
| 143 | `modules/purchases/purchases.service.ts:1755` | PurchaseReceipt.update | PurchasesService.executeReturnPostingInternal | yes | Fixed: tenant filter added |
| 144 | `modules/purchases/purchases.service.ts:1909` | PurchaseReturn.update | PurchasesService.approveReturn | yes | Fixed: tenant filter added |
| 145 | `modules/purchases/purchases.service.ts:2010` | StockLevel.update | PurchasesService.cancelReturn | yes | Fixed: tenant filter added |
| 146 | `modules/purchases/purchases.service.ts:2022` | PurchaseReceiptItem.update | PurchasesService.cancelReturn | yes | Fixed: tenant filter added |
| 147 | `modules/purchases/purchases.service.ts:2058` | PurchaseReceiptItem.findMany | PurchasesService.cancelReturn | yes | Fixed: tenant filter added |
| 148 | `modules/purchases/purchases.service.ts:2071` | PurchaseReceipt.update | PurchasesService.cancelReturn | yes | Fixed: tenant filter added |
| 149 | `modules/purchases/purchases.service.ts:2088` | PurchaseReturn.update | PurchasesService.cancelReturn | yes | Fixed: tenant filter added |
| 150 | `modules/purchases/purchases.service.ts:2128` | PurchaseReturnItem.deleteMany | PurchasesService.deleteReturn | yes | Fixed: tenant filter added |
| 151 | `modules/purchases/purchases.service.ts:2132` | PurchaseReturn.delete | PurchasesService.deleteReturn | yes | Fixed: tenant filter added |
| 152 | `modules/sales/counterparties/counterparties.service.ts:69` | CounterpartyFolder.update | CounterpartiesService.updateFolder | yes | Fixed: tenant filter added |
| 153 | `modules/sales/counterparties/counterparties.service.ts:86` | CounterpartyFolder.delete | CounterpartiesService.deleteFolder | yes | Fixed: tenant filter added |
| 154 | `modules/sales/counterparties/counterparties.service.ts:403` | Counterparty.update | CounterpartiesService.update | yes | Fixed: tenant filter added |
| 155 | `modules/sales/counterparties/counterparties.service.ts:487` | SalesInvoice.count | CounterpartiesService.delete | yes | Fixed: tenant filter added |
| 156 | `modules/sales/counterparties/counterparties.service.ts:488` | PurchaseReceipt.count | CounterpartiesService.delete | yes | Fixed: tenant filter added |
| 157 | `modules/sales/counterparties/counterparties.service.ts:489` | Payment.count | CounterpartiesService.delete | yes | Fixed: tenant filter added |
| 158 | `modules/sales/counterparties/counterparties.service.ts:490` | Deal.count | CounterpartiesService.delete | yes | Fixed: tenant filter added |
| 159 | `modules/sales/counterparties/counterparties.service.ts:504` | Counterparty.delete | CounterpartiesService.delete | yes | Fixed: tenant filter added |
| 160 | `modules/sales/crm/crm.service.ts:69` | Deal.update | CrmService.updateDealStage | yes | Fixed: tenant filter added |
| 161 | `modules/sales/crm/crm.service.ts:98` | Deal.update | CrmService.updateDeal | yes | Fixed: tenant filter added |
| 162 | `modules/sales/crm/crm.service.ts:127` | Deal.delete | CrmService.deleteDeal | yes | Fixed: tenant filter added |
| 163 | `modules/sales/invoices/sales-invoices.service.ts:398` | SalesInvoice.update | SalesInvoicesService.updateInvoice | yes | Fixed: tenant filter added |
| 164 | `modules/sales/invoices/sales-invoices.service.ts:573` | SalesInvoiceItem.update | SalesInvoicesService.postInvoice | yes | Fixed: tenant filter added |
| 165 | `modules/sales/invoices/sales-invoices.service.ts:693` | SalesInvoice.update | SalesInvoicesService.postInvoice | yes | Fixed: tenant filter added |
| 166 | `modules/sales/invoices/sales-invoices.service.ts:753` | StockLevel.update | SalesInvoicesService.unpostInvoice | yes | Fixed: tenant filter added |
| 167 | `modules/sales/invoices/sales-invoices.service.ts:761` | BatchConsumption.findMany | SalesInvoicesService.unpostInvoice | yes | Fixed: tenant filter added |
| 168 | `modules/sales/invoices/sales-invoices.service.ts:768` | ProductBatch.update | SalesInvoicesService.unpostInvoice | yes | Fixed: tenant filter added |
| 169 | `modules/sales/invoices/sales-invoices.service.ts:774` | BatchConsumption.deleteMany | SalesInvoicesService.unpostInvoice | yes | Fixed: tenant filter added |
| 170 | `modules/sales/invoices/sales-invoices.service.ts:800` | SalesInvoiceItem.updateMany | SalesInvoicesService.unpostInvoice | yes | Fixed: tenant filter added |
| 171 | `modules/sales/invoices/sales-invoices.service.ts:822` | SalesInvoice.update | SalesInvoicesService.unpostInvoice | yes | Fixed: tenant filter added |
| 172 | `modules/sales/invoices/sales-invoices.service.ts:855` | SalesInvoice.delete | SalesInvoicesService.deleteInvoice | yes | Fixed: tenant filter added |
| 173 | `modules/sales/invoices/sales-invoices.service.ts:1130` | SalesReturn.update | SalesInvoicesService.executePostReturn | yes | Fixed: tenant filter added |
| 174 | `modules/sales/invoices/sales-invoices.service.ts:1195` | StockLevel.update | SalesInvoicesService.executePostReturn | yes | Fixed: tenant filter added |
| 175 | `modules/sales/invoices/sales-invoices.service.ts:1254` | SalesInvoice.update | SalesInvoicesService.executePostReturn | yes | Fixed: tenant filter added |
| 176 | `modules/sales/invoices/sales-invoices.service.ts:1482` | SalesReturn.update | SalesInvoicesService.cancelReturn | yes | Fixed: tenant filter added |
| 177 | `modules/sales/invoices/sales-invoices.service.ts:1535` | StockLevel.update | SalesInvoicesService.cancelReturn | yes | Fixed: tenant filter added |
| 178 | `modules/sales/invoices/sales-invoices.service.ts:1556` | ProductBatch.delete | SalesInvoicesService.cancelReturn | yes | Fixed: tenant filter added |
| 179 | `modules/sales/invoices/sales-invoices.service.ts:1598` | SalesInvoice.update | SalesInvoicesService.cancelReturn | yes | Fixed: tenant filter added |
| 180 | `modules/sales/invoices/sales-invoices.service.ts:1639` | SalesReturn.update | SalesInvoicesService.cancelReturn | yes | Fixed: tenant filter added |
| 181 | `modules/sales/invoices/sales-invoices.service.ts:1677` | SalesReturnItem.deleteMany | SalesInvoicesService.deleteReturn | yes | Fixed: tenant filter added |
| 182 | `modules/sales/invoices/sales-invoices.service.ts:1681` | SalesReturn.delete | SalesInvoicesService.deleteReturn | yes | Fixed: tenant filter added |
| 183 | `modules/sales/invoices/sales-invoices.service.ts:1779` | ProductPrice.upsert | SalesInvoicesService.upsertProductPrice | yes | Fixed: tenant filter added |
| 184 | `modules/sales/invoices/sales-invoices.service.ts:1809` | PriceList.update | SalesInvoicesService.updatePriceList | yes | Fixed: tenant filter added |
| 185 | `modules/sales/invoices/sales-invoices.service.ts:1840` | PriceList.update | SalesInvoicesService.deletePriceList | yes | Fixed: tenant filter added |
| 186 | `modules/sales/invoices/sales-invoices.service.ts:1846` | PriceList.delete | SalesInvoicesService.deletePriceList | yes | Fixed: tenant filter added |
| 187 | `modules/sales/invoices/sales-invoices.service.ts:1866` | ProductPrice.upsert | SalesInvoicesService.bulkSetPrices | yes | Fixed: tenant filter added |
| 188 | `modules/sales/invoices/sales-invoices.service.ts:2031` | ProductPrice.findUnique | SalesInvoicesService.resolveProductPrice | yes | Fixed: tenant filter added |
| 189 | `modules/sales/orders/sales-orders.service.ts:589` | SalesOrder.findFirst | SalesOrdersService.create | yes | Fixed: tenant filter added |
| 190 | `modules/sales/orders/sales-orders.service.ts:729` | SalesOrderItem.deleteMany | SalesOrdersService.update | yes | Fixed: tenant filter added |
| 191 | `modules/sales/orders/sales-orders.service.ts:733` | SalesOrder.update | SalesOrdersService.update | yes | Fixed: tenant filter added |
| 192 | `modules/sales/orders/sales-orders.service.ts:816` | SalesOrderItem.deleteMany | SalesOrdersService.delete | yes | Fixed: tenant filter added |
| 193 | `modules/sales/orders/sales-orders.service.ts:820` | SalesOrder.delete | SalesOrdersService.delete | yes | Fixed: tenant filter added |
| 194 | `modules/sales/orders/sales-orders.service.ts:949` | SalesOrderItem.findMany | SalesOrdersService.transition | yes | Fixed: tenant filter added |
| 195 | `modules/sales/orders/sales-orders.service.ts:960` | SalesOrderItem.update | SalesOrdersService.transition | yes | Fixed: tenant filter added |
| 196 | `modules/sales/orders/sales-orders.service.ts:976` | SalesOrderItem.findMany | SalesOrdersService.transition | yes | Fixed: tenant filter added |
| 197 | `modules/sales/orders/sales-orders.service.ts:999` | SalesOrder.update | SalesOrdersService.transition | yes | Fixed: tenant filter added |
| 198 | `modules/sales/orders/sales-orders.service.ts:1099` | SalesOrder.update | SalesOrdersService.updateStatus | yes | Fixed: tenant filter added |
| 199 | `modules/sales/orders/sales-orders.service.ts:1188` | ProductionOrder.updateMany | SalesOrdersService._handleCancel | yes | Fixed: tenant filter added |
| 200 | `modules/sales/orders/sales-orders.service.ts:1202` | SalesOrder.update | SalesOrdersService._handleCancel | yes | Fixed: tenant filter added |
| 201 | `modules/sales/orders/sales-orders.service.ts:1245` | SalesOrder.update | SalesOrdersService.completeOrder | yes | Fixed: tenant filter added |
| 202 | `modules/sales/orders/sales-orders.service.ts:1296` | SalesOrder.update | SalesOrdersService.onPaymentRegistered | yes | Fixed: tenant filter added |
| 203 | `modules/sales/orders/sales-orders.service.ts:1303` | SalesOrder.update | SalesOrdersService.onPaymentRegistered | yes | Fixed: tenant filter added |
| 204 | `modules/sales/orders/sales-orders.service.ts:1308` | SalesOrder.update | SalesOrdersService.onPaymentRegistered | yes | Fixed: tenant filter added |
| 205 | `modules/sales/orders/sales-orders.service.ts:1316` | SalesOrder.update | SalesOrdersService.onPaymentRegistered | yes | Fixed: tenant filter added |
| 206 | `modules/sales/orders/sales-orders.service.ts:1347` | ProductionOrder.update | SalesOrdersService.updateProductionReadyQty | yes | Fixed: tenant filter added |
| 207 | `modules/sales/orders/sales-orders.service.ts:1364` | SalesOrderItem.update | SalesOrdersService.updateProductionReadyQty | yes | Fixed: tenant filter added |
| 208 | `modules/sales/orders/sales-orders.service.ts:1400` | SalesOrder.update | SalesOrdersService.updateProductionReadyQty | yes | Fixed: tenant filter added |
| 209 | `modules/sales/orders/sales-orders.service.ts:1419` | ProductionOrder.findFirst | SalesOrdersService.updateProductionReadyQty | yes | Fixed: tenant filter added |
| 210 | `modules/sales/orders/sales-orders.service.ts:1449` | ProductionOrder.update | SalesOrdersService.startProductionOrder | yes | Fixed: tenant filter added |
| 211 | `modules/sales/orders/sales-orders.service.ts:1456` | SalesOrder.update | SalesOrdersService.startProductionOrder | yes | Fixed: tenant filter added |
| 212 | `modules/sales/orders/sales-orders.service.ts:1463` | ProductionOrder.findFirst | SalesOrdersService.startProductionOrder | yes | Fixed: tenant filter added |
| 213 | `modules/sales/orders/sales-orders.service.ts:1769` | SettlementAllocation.findMany | SalesOrdersService.dispatch | yes | Fixed: tenant filter added |
| 214 | `modules/sales/orders/sales-orders.service.ts:1851` | SalesInvoiceItem.update | SalesOrdersService.dispatch | yes | Fixed: tenant filter added |
| 215 | `modules/sales/orders/sales-orders.service.ts:1873` | SalesOrderItem.update | SalesOrdersService.dispatch | yes | Fixed: tenant filter added |
| 216 | `modules/sales/orders/sales-orders.service.ts:1968` | SalesInvoice.update | SalesOrdersService.dispatch | yes | Fixed: tenant filter added |
| 217 | `modules/sales/orders/sales-orders.service.ts:1982` | SalesOrderItem.findMany | SalesOrdersService.dispatch | yes | Fixed: tenant filter added |
| 218 | `modules/sales/orders/sales-orders.service.ts:1993` | SalesOrder.update | SalesOrdersService.dispatch | yes | Fixed: tenant filter added |
| 219 | `modules/sales/orders/sales-orders.service.ts:2015` | SalesOrder.findFirst | SalesOrdersService.dispatch | yes | Fixed: tenant filter added |
| 220 | `modules/sales/payments/payments.service.ts:152` | CashAccount.update | PaymentsService.registerPayment | yes | Fixed: tenant filter added |
| 221 | `modules/sales/payments/payments.service.ts:212` | SalesInvoice.update | PaymentsService.registerPayment | yes | Fixed: tenant filter added |
| 222 | `modules/sales/payments/payments.service.ts:221` | SalesOrder.update | PaymentsService.registerPayment | yes | Fixed: tenant filter added |
| 223 | `modules/services/services.service.ts:369` | ServiceActItem.deleteMany | ServicesService.update | yes | Fixed: tenant filter added |
| 224 | `modules/services/services.service.ts:387` | ServiceAct.update | ServicesService.update | yes | Fixed: tenant filter added |
| 225 | `modules/services/services.service.ts:442` | ServiceAct.update | ServicesService.post | yes | Fixed: tenant filter added |
| 226 | `modules/services/services.service.ts:544` | ServiceAct.update | ServicesService.cancel | yes | Fixed: tenant filter added |
| 227 | `modules/services/services.service.ts:623` | ServiceAct.update | ServicesService.unpost | yes | Fixed: tenant filter added |
| 228 | `modules/services/services.service.ts:653` | ServiceActItem.deleteMany | ServicesService.remove | yes | Fixed: tenant filter added |
| 229 | `modules/services/services.service.ts:657` | ServiceAct.delete | ServicesService.remove | yes | Fixed: tenant filter added |
| 230 | `modules/settlements/counterparty-settlement.service.ts:62` | CounterpartySettlementEntry.findUnique | CounterpartySettlementService.recordMovement | yes | Fixed: tenant filter added |
| 231 | `modules/settlements/counterparty-settlement.service.ts:71` | CounterpartyBalance.findUnique | CounterpartySettlementService.recordMovement | yes | Fixed: tenant filter added |
| 232 | `modules/settlements/counterparty-settlement.service.ts:88` | CounterpartyBalance.upsert | CounterpartySettlementService.recordMovement | yes | Fixed: tenant filter added |
| 233 | `modules/settlements/settlement-allocation.service.ts:56` | SettlementAllocation.findUnique | SettlementAllocationService.recordAllocation | yes | Fixed: tenant filter added |
| 234 | `modules/settlements/settlement-allocation.service.ts:131` | SettlementAllocation.findMany | SettlementAllocationService.recordAllocation | yes | Fixed: tenant filter added |
| 235 | `modules/settlements/settlement-allocation.service.ts:176` | SettlementAllocation.findUnique | SettlementAllocationService.recordAllocation | yes | Fixed: tenant filter added |
| 236 | `modules/settlements/settlement-allocation.service.ts:203` | SettlementAllocation.findUnique | SettlementAllocationService.reverseAllocation | yes | Fixed: tenant filter added |
| 237 | `modules/settlements/settlement-allocation.service.ts:256` | SettlementAllocation.findUnique | SettlementAllocationService.reverseAllocation | yes | Fixed: tenant filter added |
| 238 | `modules/settlements/settlement-allocation.service.ts:514` | SettlementAllocation.findMany | SettlementAllocationService.getTargetOpenAmount | yes | Fixed: tenant filter added |
| 239 | `modules/settlements/settlement-allocation.service.ts:527` | CounterpartyBalance.findUnique | SettlementAllocationService.getTargetOpenAmount | yes | Fixed: tenant filter added |
| 240 | `modules/super-admin/super-admin.service.ts:151` | User.findFirst | SuperAdminService.createTenant | yes | By design: super-admin only, cross-tenant |
| 241 | `modules/super-admin/super-admin.service.ts:269` | Subscription.findMany | SuperAdminService.getGlobalMetrics | yes | By design: super-admin only, cross-tenant |
| 242 | `modules/super-admin/super-admin.service.ts:272` | User.count (no where) | SuperAdminService.getGlobalMetrics | yes | By design: super-admin only, cross-tenant |
| 243 | `modules/super-admin/super-admin.service.ts:346` | Subscription.update | SuperAdminService.updateTenant | yes | By design: super-admin only, cross-tenant |
| 244 | `modules/super-admin/super-admin.service.ts:399` | SupportTicket.findMany (no where) | SuperAdminService.getSupportTickets | yes | By design: super-admin only, cross-tenant |
| 245 | `modules/super-admin/super-admin.service.ts:410` | SupportTicket.findUnique | SuperAdminService.replyTicket | yes | By design: super-admin only, cross-tenant |
| 246 | `modules/super-admin/super-admin.service.ts:427` | SupportTicket.update | SuperAdminService.replyTicket | yes | By design: super-admin only, cross-tenant |
| 247 | `modules/super-admin/super-admin.service.ts:453` | AuditLog.findMany | SuperAdminService.getAuditLogs | yes | By design: super-admin only, cross-tenant |
| 248 | `modules/tenants/tenants.service.ts:119` | Branch.update | TenantsService.updateBranch | yes | Fixed: tenant filter added |
| 249 | `modules/tenants/tenants.service.ts:152` | Branch.delete | TenantsService.deleteBranch | yes | Fixed: tenant filter added |
| 250 | `modules/tenants/tenants.service.ts:201` | Warehouse.update | TenantsService.updateWarehouse | yes | Fixed: tenant filter added |
| 251 | `modules/tenants/tenants.service.ts:259` | Warehouse.delete | TenantsService.deleteWarehouse | yes | Fixed: tenant filter added |
| 252 | `modules/users/users.service.ts:35` | Role.findFirst | UsersService.createUser | yes | Fixed: tenant filter added |
| 253 | `modules/users/users.service.ts:147` | Role.findFirst | UsersService.updateUser | yes | Fixed: tenant filter added |
| 254 | `modules/users/users.service.ts:159` | UserRole.deleteMany | UsersService.updateUser | yes | Fixed: tenant filter added |
| 255 | `modules/users/users.service.ts:171` | User.update | UsersService.updateUser | yes | Fixed: tenant filter added |
| 256 | `modules/users/users.service.ts:198` | Role.findMany | UsersService.getRoles | yes | Fixed: tenant filter added |
| 257 | `modules/users/users.service.ts:252` | UserRole.deleteMany | UsersService.deleteUser | yes | Fixed: tenant filter added |
| 258 | `modules/users/users.service.ts:257` | User.delete | UsersService.deleteUser | yes | Fixed: tenant filter added |
| 259 | `modules/users/users.service.ts:262` | User.update | UsersService.deleteUser | yes | Fixed: tenant filter added |
| 260 | `scripts/create-superadmin.ts:65` | User.findFirst | main | no | Not reachable: CLI script / seed |
| 261 | `scripts/create-superadmin.ts:70` | User.update | main | no | Not reachable: CLI script / seed |
| 262 | `scripts/create-superadmin.ts:81` | UserRole.findFirst | main | no | Not reachable: CLI script / seed |
| 263 | `prisma/seed.ts:97` | RolePermission.findFirst | main | no | Not reachable: CLI script / seed |
| 264 | `prisma/seed.ts:115` | User.findFirst | main | no | Not reachable: CLI script / seed |
| 265 | `prisma/seed.ts:139` | User.update | main | no | Not reachable: CLI script / seed |
| 266 | `prisma/seed.ts:163` | User.findFirst | main | no | Not reachable: CLI script / seed |
| 267 | `prisma/seed.ts:188` | User.update | main | no | Not reachable: CLI script / seed |
| 268 | `prisma/seed.ts:330` | Counterparty.upsert | main | no | Not reachable: CLI script / seed |
| 269 | `prisma/seed.ts:347` | Counterparty.upsert | main | no | Not reachable: CLI script / seed |

## Totals

| Outcome | Count |
|---|---|
| By design: caller's own row from a verified token | 1 |
| Not reachable: startup seed of an empty database | 4 |
| By design: identity lookup before a tenant is known | 5 |
| By design: authenticated provider callback, no tenant in the request | 10 |
| Fixed: tenant filter added | 231 |
| By design: super-admin only, cross-tenant | 8 |
| Not reachable: CLI script / seed | 10 |
| **All** | **269** |

## Second sweep: ids taken from the request (2026-11-13)
The first sweep added tenant filters to `where` clauses. This one covers the
other direction: ids a request supplies (body, route params, query, and ids
nested in line arrays) that a service writes as foreign keys. Postgres foreign
keys do not know tenants, so an unchecked id let tenant A attach tenant B's
warehouse, counterparty, product, price list, category, cash account, account,
user or branch to its own document, read B's row back through the document's
relations (e.g. `include: { warehouse: true, items: { include: { product: true } } }`),
and post stock or money into B's rows.

**Shared helper:** `assertTenantOwned(db, tenantId, { warehouse: dto.warehouseId,
product: dto.items.map((i) => i.productId), ... })` in
`backend/src/common/prisma/assert-tenant-owned.ts`. One query per model,
skips empty optional ids, accepts system transaction types (no tenant), scopes
child rows through their parent, answers the same for unknown and foreign ids
(`400 <Model> topilmadi: <ids>`).

**Guard:** `backend/src/common/prisma/request-reference.spec.ts` scans every
`*.service.ts` with the TypeScript AST (`request-reference-scan.ts`). A method
that takes a DTO-typed or inline-object parameter and reads an id-like
property from it (directly, or from an element of one of its arrays) must call
`assertTenantOwned` (directly or through a same-class helper) or be allowlisted
with a reason; stale allowlist entries fail too. Limitation: ids passed as bare
positional string arguments are not seen by the scan; the positional ones that
exist today are listed below by hand.

**Tests (one per distinct pattern, all fail on the previous code):**
`backend/src/common/prisma/tenant-isolation.spec.ts`
1. header and line ids on create (sales invoice: warehouse, counterparty, price list, product);
2. two ids of one model plus line ids (stock transfer);
3. optional reference on update (product category);
4. shared system rows (finance transaction type: system or own, never another tenant's);
5. pairs of ids inside lines (manual journal entry accounts);
6. override on a lifecycle action (sales-order dispatch warehouse).
`assert-tenant-owned.spec.ts` covers the helper itself.

Read-only list filters (`?counterpartyId=` etc.) are safe without the helper:
the query is scoped by `tenantId`, so a foreign id matches nothing.

"Checked before" is the state before this sweep. Line numbers are as of the
commit that adds this section.

| # | File:line | Method | Id source | Ids | Checked before | Outcome |
|---|---|---|---|---|---|---|
| 1 | `src/modules/accounting/journal/journal.service.ts:89` | JournalService.createManualEntry (POST /api/accounting/journal) | body lines | debitAccountId, creditAccountId | no (controller called createJournalEntry directly) | Fixed: new createManualEntry checks, controller uses it |
| 2 | `src/modules/accounting/journal/journal.service.ts:99` | JournalService.createJournalEntry | body/query or internal | creditAccountId, debitAccountId, sourceDocId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 3 | `src/modules/audit/audit.service.ts:10` | AuditService.logAction | body/query or internal | entityId, userId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 4 | `src/modules/finance/finance.service.ts:1191` | FinanceService.resolveSettlementContext | body/query or internal | counterpartyId, sourceDocId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 5 | `src/modules/finance/finance.service.ts:1713` | FinanceService.createTransfer | body/query or internal | fromAccountId, toAccountId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 6 | `src/modules/finance/finance.service.ts:1908` | FinanceService.reverseCounterpartySettlement | body/query or internal | counterpartyId, sourceDocId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 7 | `src/modules/finance/finance.service.ts:2023` | FinanceService.reverseLegacyDocumentAllocation | body/query or internal | sourceDocId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 8 | `src/modules/finance/finance.service.ts:2069` | FinanceService.reversePostedTransaction | body/query or internal | accountId, transferToId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 9 | `src/modules/finance/finance.service.ts:2182` | FinanceService.updateTransaction | body | transactionTypeId | no | Fixed |
| 10 | `src/modules/finance/finance.service.ts:692` | FinanceService.listTransactions | body/query or internal | accountId, counterpartyId, transactionTypeId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 11 | `src/modules/finance/finance.service.ts:792` | FinanceService.createIncome | body | accountId, counterpartyId, responsibleUserId, sourceDocId, transactionTypeId | partly: accountId, counterpartyId, sourceDocId checked; transactionTypeId, responsibleUserId not | Fixed |
| 12 | `src/modules/finance/finance.service.ts:920` | FinanceService.createExpense | body | accountId, counterpartyId, responsibleUserId, sourceDocId, transactionTypeId | partly: accountId, counterpartyId, sourceDocId checked; transactionTypeId, responsibleUserId not | Fixed |
| 13 | `src/modules/fixed-assets/fixed-assets.service.ts:60` | FixedAssetsService.create | body | custodianUserId | no | Fixed |
| 14 | `src/modules/fixed-assets/fixed-assets.service.ts:98` | FixedAssetsService.update | body | custodianUserId | no | Fixed |
| 15 | `src/modules/inventory/categories/categories.service.ts:11` | CategoriesService.create | body | parentId | no | Fixed |
| 16 | `src/modules/inventory/categories/categories.service.ts:46` | CategoriesService.update | body | parentId | no | Fixed |
| 17 | `src/modules/inventory/documents/inventory-documents.service.ts:27` | InventoryDocumentsService.createAndPostDocument | body + lines | productId, warehouseId | partly: warehouseId checked; line productId not | Fixed |
| 18 | `src/modules/inventory/products/products.service.ts:20` | ProductsService.create | body | categoryId | no | Fixed |
| 19 | `src/modules/inventory/products/products.service.ts:293` | ProductsService.update | body | categoryId | no | Fixed |
| 20 | `src/modules/inventory/stock-reservation/stock-reservation.service.ts:64` | StockReservationService.reserveStockForOrder | body/query or internal | orderItemId, productId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 21 | `src/modules/inventory/transfers/stock-transfers.service.ts:25` | StockTransfersService.createTransfer | body + lines | productId, sourceWarehouseId, targetWarehouseId | no | Fixed |
| 22 | `src/modules/opening-balances/opening-balances.service.ts:280` | OpeningBalancesService.create | lines | accountId, counterpartyId, fixedAssetId, productId, warehouseId | no (accountId only checked later, at posting) | Fixed |
| 23 | `src/modules/opening-balances/opening-balances.service.ts:373` | OpeningBalancesService.updateLines | lines | accountId, counterpartyId, fixedAssetId, productId, warehouseId | no (accountId only checked later, at posting) | Fixed |
| 24 | `src/modules/opening-balances/opening-balances.service.ts:81` | OpeningBalancesService.assertLineReferences | lines (helper) | accountId, counterpartyId, fixedAssetId, productId, warehouseId | n/a (new helper) | The check used by create/updateLines |
| 25 | `src/modules/production/production.service.ts:246` | ProductionService.createDocument | body/query or internal | recipeId, responsibleId, warehouseId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 26 | `src/modules/production/production.service.ts:316` | ProductionService.findDocuments | body/query or internal | productId, responsibleId, warehouseId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 27 | `src/modules/production/production.service.ts:439` | ProductionService.updateActualMaterials | body/query or internal | productId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 28 | `src/modules/production/production.service.ts:73` | ProductionService.createRecipe | body/query or internal | productId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 29 | `src/modules/production/production.service.ts:774` | ProductionService.consumeMaterial | body/query or internal | productId, productionDocumentId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 30 | `src/modules/purchases/additional-expenses.service.ts:117` | AdditionalExpensesService.createDraft | body | cashAccountId, counterpartyId, receiptId, selectedItemIds | partly: receiptId, selectedItemIds checked; counterpartyId, cashAccountId not | Fixed |
| 31 | `src/modules/purchases/additional-expenses.service.ts:235` | AdditionalExpensesService.updateDraft | body | cashAccountId, counterpartyId, receiptId, selectedItemIds | partly: receiptId, selectedItemIds checked; counterpartyId, cashAccountId not | Fixed |
| 32 | `src/modules/purchases/additional-expenses.service.ts:399` | AdditionalExpensesService.findAll | body/query or internal | counterpartyId, receiptId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 33 | `src/modules/purchases/additional-expenses.service.ts:71` | AdditionalExpensesService.calculateAllocationPreview | body/query or internal | receiptId, selectedItemIds | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 34 | `src/modules/purchases/purchases.service.ts:102` | PurchasesService.findAllReceipts | body/query or internal | counterpartyId, warehouseId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 35 | `src/modules/purchases/purchases.service.ts:1203` | PurchasesService.addExpense | body | receiptId, supplierId | partly: receiptId checked; supplierId not | Fixed |
| 36 | `src/modules/purchases/purchases.service.ts:1356` | PurchasesService.createReturn | body + lines | counterpartyId, productId, receiptId, warehouseId | partly: products and receipt checked; counterparty/warehouse only when a receipt is linked | Fixed |
| 37 | `src/modules/purchases/purchases.service.ts:1604` | PurchasesService.executeReturnPostingInternal | body/query or internal | counterpartyId, receiptId, warehouseId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 38 | `src/modules/purchases/purchases.service.ts:208` | PurchasesService.createReceipt | body + lines | counterpartyId, productId, warehouseId | no | Fixed |
| 39 | `src/modules/purchases/purchases.service.ts:2169` | PurchasesService.findAllReturns | body/query or internal | supplierId, warehouseId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 40 | `src/modules/purchases/purchases.service.ts:351` | PurchasesService.updateReceipt | body + lines | counterpartyId, productId, warehouseId | no | Fixed |
| 41 | `src/modules/purchases/purchases.service.ts:920` | PurchasesService.payPurchaseReceipt | body/query or internal | cashAccountId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 42 | `src/modules/sales/counterparties/counterparties.service.ts:400` | CounterpartiesService.update | body | folderId, priceListId | no | Fixed |
| 43 | `src/modules/sales/counterparties/counterparties.service.ts:96` | CounterpartiesService.create | body | folderId, priceListId | no | Fixed |
| 44 | `src/modules/sales/crm/crm.service.ts:11` | CrmService.createDeal | body | assignedUserId, counterpartyId | no | Fixed |
| 45 | `src/modules/sales/crm/crm.service.ts:61` | CrmService.updateDealStage | params | dealId only | yes | Checked |
| 46 | `src/modules/sales/crm/crm.service.ts:84` | CrmService.updateDeal | body | assignedUserId, counterpartyId | no | Fixed |
| 47 | `src/modules/sales/invoices/sales-invoices.service.ts:1116` | SalesInvoicesService.executePostReturn | body/query or internal | counterpartyId, defectWarehouseId, existingReturnId, invoiceId, productId, warehouseId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 48 | `src/modules/sales/invoices/sales-invoices.service.ts:137` | SalesInvoicesService.createInvoice | body + lines | counterpartyId, priceListId, productId, warehouseId | no | Fixed |
| 49 | `src/modules/sales/invoices/sales-invoices.service.ts:1784` | SalesInvoicesService.upsertProductPrice | params + body (positional) | priceListId, productId | yes (fixed in the first sweep) | Checked |
| 50 | `src/modules/sales/invoices/sales-invoices.service.ts:1872` | SalesInvoicesService.bulkSetPrices | body/query or internal | productId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 51 | `src/modules/sales/invoices/sales-invoices.service.ts:1948` | SalesInvoicesService.resolveProductPrice | body/query or internal | counterpartyId, priceListId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 52 | `src/modules/sales/invoices/sales-invoices.service.ts:290` | SalesInvoicesService.updateInvoice | body + lines | counterpartyId, priceListId, productId, warehouseId | no | Fixed |
| 53 | `src/modules/sales/invoices/sales-invoices.service.ts:60` | SalesInvoicesService.findAll | body/query or internal | counterpartyId, warehouseId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 54 | `src/modules/sales/invoices/sales-invoices.service.ts:922` | SalesInvoicesService.createReturn | body + lines | counterpartyId, defectWarehouseId, invoiceId, productId, warehouseId | partly: invoice pins counterparty, warehouse, products; defectWarehouseId not | Fixed |
| 55 | `src/modules/sales/orders/sales-orders.service.ts:1036` | SalesOrdersService.updateStatus | body (positional arg) | warehouseId | no | Fixed |
| 56 | `src/modules/sales/orders/sales-orders.service.ts:1490` | SalesOrdersService.findProductionOrders | body/query or internal | salesOrderId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 57 | `src/modules/sales/orders/sales-orders.service.ts:1514` | SalesOrdersService.dispatch | body | orderItemId, warehouseId | partly: orderItemId matched to the order; warehouseId override not | Fixed |
| 58 | `src/modules/sales/orders/sales-orders.service.ts:212` | SalesOrdersService.findAll | body/query or internal | assignedSellerId, counterpartyId, productId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 59 | `src/modules/sales/orders/sales-orders.service.ts:382` | SalesOrdersService.create | body + lines | assignedSellerId, counterpartyId, priceListId, productId, warehouseId | partly: warehouseId checked; counterparty, price list, seller, products not (unknown products were silently kept) | Fixed |
| 60 | `src/modules/sales/orders/sales-orders.service.ts:607` | SalesOrdersService.update | body + lines | assignedSellerId, counterpartyId, priceListId, productId, warehouseId | partly: warehouseId checked; counterparty, price list, seller, products not | Fixed |
| 61 | `src/modules/sales/payments/payments.service.ts:36` | PaymentsService.registerPayment | body/query or internal | cashAccountId, counterpartyId, invoiceId, orderId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 62 | `src/modules/services/services.service.ts:109` | ServicesService.create | body + lines | counterpartyId, productId | partly: counterpartyId checked; line productId not | Fixed |
| 63 | `src/modules/services/services.service.ts:210` | ServicesService.findAll | body/query or internal | counterpartyId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 64 | `src/modules/services/services.service.ts:325` | ServicesService.update | body + lines | counterpartyId, productId | partly: counterpartyId checked; line productId not | Fixed |
| 65 | `src/modules/services/services.service.ts:60` | ServicesService.calculateItem | body/query or internal | productId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 66 | `src/modules/settlements/counterparty-settlement.service.ts:215` | CounterpartySettlementService.assertSameMovement | body/query or internal | counterpartyId, reversesEntryId, sourceDocId, sourceLineId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 67 | `src/modules/settlements/reconciliation.service.ts:1009` | ReconciliationService.allocationCandidates | body/query or internal | salesOrderId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 68 | `src/modules/settlements/reconciliation.service.ts:1076` | ReconciliationService.buildProjection | body/query or internal | counterpartyId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 69 | `src/modules/settlements/reconciliation.service.ts:1117` | ReconciliationService.findProjectionDifferences | body/query or internal | counterpartyId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 70 | `src/modules/settlements/reconciliation.service.ts:994` | ReconciliationService.sumExistingAllocations | body/query or internal | targetId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 71 | `src/modules/settlements/settlement-allocation.service.ts:192` | SettlementAllocationService.reverseAllocation | body/query or internal | allocationId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 72 | `src/modules/settlements/settlement-allocation.service.ts:566` | SettlementAllocationService.assertSameAllocation | body/query or internal | counterpartyId, financeTransactionId, reversesAllocationId, targetId | yes | Allowlisted (see request-reference.spec.ts for the reason) |
| 73 | `src/modules/tenants/tenants.service.ts:161` | TenantsService.createWarehouse | body (positional arg) | branchId | no | Fixed |
| 74 | `src/modules/tenants/tenants.service.ts:188` | TenantsService.updateWarehouse | body | branchId | no | Fixed |
| 75 | `src/modules/users/users.service.ts:23` | UsersService.createUser / updateUser | body | roleSlug (role looked up by slug) | yes: role looked up with the tenant (first sweep) | Checked |

Note: an opening-balance line's `accountId` is a kassa (`CashAccount`); it is checked as such (fix d7d5496).

**Totals:** 75 entry points; 35 fixed (were unchecked or partly checked), 40 already checked, read-only, or internal.
