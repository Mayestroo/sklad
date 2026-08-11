-- CreateEnum
CREATE TYPE "PurchaseDocStatus" AS ENUM ('DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('TRANSPORT', 'CUSTOMS', 'BROKER', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseAllocationMethod" AS ENUM ('BY_AMOUNT', 'BY_QUANTITY', 'BY_WEIGHT');

-- CreateEnum
CREATE TYPE "ReturnDocStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "doc_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counterparty_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchange_rate" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "contract_number" TEXT,
    "contract_date" TIMESTAMP(3),
    "comment" TEXT,
    "status" "PurchaseDocStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additional_expenses_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gtd_number" TEXT,
    "gtd_date" TIMESTAMP(3),
    "customs_post" TEXT,
    "created_by_id" TEXT,
    "posted_by_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(15,2) NOT NULL,
    "allocated_expenses" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "landed_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_expenses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "expense_type" "ExpenseType" NOT NULL,
    "supplier_id" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "allocation_method" "ExpenseAllocationMethod" NOT NULL DEFAULT 'BY_AMOUNT',
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receipt_id" TEXT,
    "counterparty_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "reason" TEXT,
    "status" "ReturnDocStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "total_price" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_batches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "receipt_id" TEXT,
    "batch_number" TEXT NOT NULL,
    "initial_qty" DECIMAL(15,3) NOT NULL,
    "remaining_qty" DECIMAL(15,3) NOT NULL,
    "purchase_price" DECIMAL(15,2) NOT NULL,
    "landed_cost" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_receipts_tenant_id_idx" ON "purchase_receipts"("tenant_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_tenant_id_counterparty_id_idx" ON "purchase_receipts"("tenant_id", "counterparty_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_tenant_id_status_idx" ON "purchase_receipts"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_tenant_id_doc_number_key" ON "purchase_receipts"("tenant_id", "doc_number");

-- CreateIndex
CREATE INDEX "purchase_expenses_tenant_id_idx" ON "purchase_expenses"("tenant_id");

-- CreateIndex
CREATE INDEX "purchase_returns_tenant_id_idx" ON "purchase_returns"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_tenant_id_return_number_key" ON "purchase_returns"("tenant_id", "return_number");

-- CreateIndex
CREATE INDEX "product_batches_tenant_id_idx" ON "product_batches"("tenant_id");

-- CreateIndex
CREATE INDEX "product_batches_tenant_id_warehouse_id_product_id_idx" ON "product_batches"("tenant_id", "warehouse_id", "product_id");

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_expenses" ADD CONSTRAINT "purchase_expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_expenses" ADD CONSTRAINT "purchase_expenses_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_expenses" ADD CONSTRAINT "purchase_expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
