-- Production module TZ v1.3 (Ishlab chiqarish): schema only.
--   * "Tayyor mahsulot" nomenclature type (FINISHED_PRODUCT), semi-finished
--     flag and the source of the catalog cost (products).
--   * Extra product units with a factor to the base unit (product_units).
--   * Recipe lines keep their entry unit, factor and loss percent; recipes can
--     be archived.
--   * Production documents: output warehouse, planned dates, extra costs,
--     total cost, unit snapshot and cancellation reason.
--   * Permission actions COMPLETE / CANCEL (production:complete, :cancel).
-- New enum values are only used by the next migration (a value added in a
-- transaction cannot be used in that same transaction).
-- Idempotent: safe to run again.

ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'COMPLETE';
ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'CANCEL';
ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'FINISHED_PRODUCT';

DO $$ BEGIN
  CREATE TYPE "ProductCostSource" AS ENUM ('MANUAL', 'PURCHASE', 'RECIPE_ESTIMATE', 'PRODUCTION_ACTUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProductionCostType" AS ENUM ('SALARY', 'ENERGY', 'DEPRECIATION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "cost_source" "ProductCostSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "is_semi_finished" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "production_recipes"
  ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "production_recipe_items"
  ADD COLUMN IF NOT EXISTS "loss_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unit" TEXT,
  ADD COLUMN IF NOT EXISTS "unit_factor" DECIMAL(24,12) NOT NULL DEFAULT 1;

ALTER TABLE "production_documents"
  ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "extra_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "output_warehouse_id" TEXT,
  ADD COLUMN IF NOT EXISTS "planned_end_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "planned_start_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "product_unit" TEXT,
  ADD COLUMN IF NOT EXISTS "total_cost" DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE "production_material_lines"
  ADD COLUMN IF NOT EXISTS "loss_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unit_of_measure" TEXT;

CREATE TABLE IF NOT EXISTS "product_units" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DECIMAL(24,12) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "production_document_costs" (
    "id" TEXT NOT NULL,
    "production_document_id" TEXT NOT NULL,
    "cost_type" "ProductionCostType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "comment" TEXT,
    CONSTRAINT "production_document_costs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "product_units_tenant_id_idx" ON "product_units"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_units_product_id_name_key" ON "product_units"("product_id", "name");
CREATE INDEX IF NOT EXISTS "production_document_costs_production_document_id_idx" ON "production_document_costs"("production_document_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_units_tenant_id_fkey') THEN
    ALTER TABLE "product_units" ADD CONSTRAINT "product_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_units_product_id_fkey') THEN
    ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_documents_output_warehouse_id_fkey') THEN
    ALTER TABLE "production_documents" ADD CONSTRAINT "production_documents_output_warehouse_id_fkey" FOREIGN KEY ("output_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_document_costs_production_document_id_fkey') THEN
    ALTER TABLE "production_document_costs" ADD CONSTRAINT "production_document_costs_production_document_id_fkey" FOREIGN KEY ("production_document_id") REFERENCES "production_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
