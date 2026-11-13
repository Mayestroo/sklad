-- AlterTable
ALTER TABLE "batch_consumptions" ADD COLUMN     "stock_transfer_item_id" TEXT;

-- CreateIndex
CREATE INDEX "batch_consumptions_stock_transfer_item_id_idx" ON "batch_consumptions"("stock_transfer_item_id");

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_stock_transfer_item_id_fkey" FOREIGN KEY ("stock_transfer_item_id") REFERENCES "stock_transfer_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A consumption belongs to exactly one source document line.
ALTER TABLE "batch_consumptions" DROP CONSTRAINT IF EXISTS "batch_consumptions_single_source_check";
ALTER TABLE "batch_consumptions"
  ADD CONSTRAINT "batch_consumptions_single_source_check"
  CHECK (num_nonnulls("sales_invoice_item_id", "purchase_return_item_id", "inventory_document_item_id", "stock_transfer_item_id") = 1);
