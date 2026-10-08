CREATE TYPE "ManufacturingStatus" AS ENUM (
  'DRAFT',
  'PLANNED',
  'IN_PROGRESS',
  'READY',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "ProductionMaterialMovementType" AS ENUM ('ISSUE', 'RETURN');

CREATE TABLE "production_recipes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "output_quantity" DECIMAL(15,3) NOT NULL,
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_recipes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_recipe_items" (
  "id" TEXT NOT NULL,
  "recipe_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  CONSTRAINT "production_recipe_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_documents" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "doc_number" TEXT NOT NULL,
  "doc_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "product_id" TEXT NOT NULL,
  "recipe_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "responsible_id" TEXT,
  "planned_quantity" DECIMAL(15,3) NOT NULL,
  "produced_quantity" DECIMAL(15,3),
  "status" "ManufacturingStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "planned_material_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "actual_material_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "created_by_id" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_material_lines" (
  "id" TEXT NOT NULL,
  "production_document_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "planned_quantity" DECIMAL(15,3) NOT NULL,
  "actual_quantity" DECIMAL(15,3),
  "unit_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "total_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
  CONSTRAINT "production_material_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_material_batches" (
  "id" TEXT NOT NULL,
  "line_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit_cost" DECIMAL(15,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_material_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_material_movements" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "production_document_id" TEXT NOT NULL,
  "line_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "movement_type" "ProductionMaterialMovementType" NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit_cost" DECIMAL(15,2) NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_material_movements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "product_batches"
ADD COLUMN "production_document_id" TEXT;

CREATE INDEX "production_recipes_tenant_id_product_id_is_active_idx"
ON "production_recipes"("tenant_id", "product_id", "is_active");
CREATE UNIQUE INDEX "production_recipe_items_recipe_id_product_id_key"
ON "production_recipe_items"("recipe_id", "product_id");
CREATE UNIQUE INDEX "production_documents_tenant_id_doc_number_key"
ON "production_documents"("tenant_id", "doc_number");
CREATE INDEX "production_documents_tenant_id_status_doc_date_idx"
ON "production_documents"("tenant_id", "status", "doc_date");
CREATE INDEX "production_documents_tenant_id_product_id_idx"
ON "production_documents"("tenant_id", "product_id");
CREATE UNIQUE INDEX "production_material_lines_production_document_id_product_id_key"
ON "production_material_lines"("production_document_id", "product_id");
CREATE UNIQUE INDEX "production_material_batches_line_id_batch_id_key"
ON "production_material_batches"("line_id", "batch_id");
CREATE INDEX "production_material_batches_batch_id_idx"
ON "production_material_batches"("batch_id");
CREATE INDEX "production_material_movements_tenant_id_production_document_id_created_at_idx"
ON "production_material_movements"("tenant_id", "production_document_id", "created_at");
CREATE INDEX "production_material_movements_batch_id_idx"
ON "production_material_movements"("batch_id");
CREATE UNIQUE INDEX "product_batches_production_document_id_key"
ON "product_batches"("production_document_id");

ALTER TABLE "production_recipes"
ADD CONSTRAINT "production_recipes_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "production_recipes_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "production_recipes_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "production_recipe_items"
ADD CONSTRAINT "production_recipe_items_recipe_id_fkey"
FOREIGN KEY ("recipe_id") REFERENCES "production_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "production_recipe_items_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_documents"
ADD CONSTRAINT "production_documents_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "production_documents_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "production_documents_recipe_id_fkey"
FOREIGN KEY ("recipe_id") REFERENCES "production_recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "production_documents_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "production_documents_responsible_id_fkey"
FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "production_documents_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "production_material_lines"
ADD CONSTRAINT "production_material_lines_production_document_id_fkey"
FOREIGN KEY ("production_document_id") REFERENCES "production_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "production_material_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_material_batches"
ADD CONSTRAINT "production_material_batches_line_id_fkey"
FOREIGN KEY ("line_id") REFERENCES "production_material_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "production_material_batches_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_material_movements"
ADD CONSTRAINT "production_material_movements_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "production_material_movements_production_document_id_fkey"
FOREIGN KEY ("production_document_id") REFERENCES "production_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "production_material_movements_line_id_fkey"
FOREIGN KEY ("line_id") REFERENCES "production_material_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "production_material_movements_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "production_material_movements_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_batches"
ADD CONSTRAINT "product_batches_production_document_id_fkey"
FOREIGN KEY ("production_document_id") REFERENCES "production_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
