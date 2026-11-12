-- AlterTable
ALTER TABLE "batch_consumptions" ADD COLUMN     "purchase_return_item_id" TEXT,
ALTER COLUMN "sales_invoice_item_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "batch_consumptions_purchase_return_item_id_idx" ON "batch_consumptions"("purchase_return_item_id");

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_purchase_return_item_id_fkey" FOREIGN KEY ("purchase_return_item_id") REFERENCES "purchase_return_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A consumption belongs to exactly one source document line.
ALTER TABLE "batch_consumptions"
  ADD CONSTRAINT "batch_consumptions_single_source_check"
  CHECK (num_nonnulls("sales_invoice_item_id", "purchase_return_item_id") = 1);
