-- Production module TZ v1.3: data for the schema added by
-- 20261121000000_production_tz_schema. Idempotent: safe to run again.

-- 1. Recipe versions replaced by an edit (inactive) become archived: before
--    this release an edit created a new recipe and deactivated the old one.
UPDATE "production_recipes" SET "is_archived" = true
 WHERE "is_active" = false AND "is_archived" = false;

-- 2. Products made by a recipe that were never bought become "Tayyor
--    mahsulot" (TZ 3.1). A product with purchase lines stays a Tovar: a
--    finished product cannot be purchased (TZ 7).
UPDATE "products" p
   SET "type" = 'FINISHED_PRODUCT',
       "cost_source" = CASE
         WHEN EXISTS (SELECT 1 FROM "production_documents" d
                       WHERE d."product_id" = p."id" AND d."status" = 'COMPLETED')
         THEN 'PRODUCTION_ACTUAL'::"ProductCostSource"
         ELSE 'RECIPE_ESTIMATE'::"ProductCostSource" END
 WHERE p."type" = 'PRODUCT'
   AND EXISTS (SELECT 1 FROM "production_recipes" r WHERE r."product_id" = p."id")
   AND NOT EXISTS (SELECT 1 FROM "purchase_receipt_items" i WHERE i."product_id" = p."id")
   AND NOT EXISTS (SELECT 1 FROM "purchase_order_items" i WHERE i."product_id" = p."id")
   AND NOT EXISTS (SELECT 1 FROM "purchase_return_items" i WHERE i."product_id" = p."id");

-- 3. Documents completed before this release: their total cost is their
--    material cost (there were no extra costs), and the units they were
--    created with are the products' current units.
UPDATE "production_documents"
   SET "total_cost" = "actual_material_cost"
 WHERE "status" = 'COMPLETED' AND "total_cost" = 0 AND "actual_material_cost" <> 0;

UPDATE "production_documents" d
   SET "product_unit" = p."unit_of_measure"::text
  FROM "products" p
 WHERE p."id" = d."product_id" AND d."product_unit" IS NULL;

UPDATE "production_material_lines" l
   SET "unit_of_measure" = p."unit_of_measure"::text
  FROM "products" p
 WHERE p."id" = l."product_id" AND l."unit_of_measure" IS NULL;

-- 4. Production permissions. Texts match PERMISSION_DESCRIPTIONS in
--    permission-catalog.ts (keep them in sync).
INSERT INTO "permissions" ("id", "module", "action", "slug", "description")
VALUES
  (gen_random_uuid()::text, 'production', 'VIEW', 'production:view',
   '{"uz": "Ishlab chiqarishni ko''rish", "ru": "Просмотр производства"}'::jsonb),
  (gen_random_uuid()::text, 'production', 'CREATE', 'production:create',
   '{"uz": "Retseptura va ishlab chiqarish hujjatlarini yaratish", "ru": "Создание рецептур и производственных документов"}'::jsonb),
  (gen_random_uuid()::text, 'production', 'EDIT', 'production:edit',
   '{"uz": "Retseptura va hujjatlarni tahrirlash, ishlab chiqarishni boshlash", "ru": "Редактирование рецептур и документов, запуск производства"}'::jsonb),
  (gen_random_uuid()::text, 'production', 'DELETE', 'production:delete',
   '{"uz": "Retsepturalarni o''chirish va arxivlash", "ru": "Удаление и архивирование рецептур"}'::jsonb),
  (gen_random_uuid()::text, 'production', 'COMPLETE', 'production:complete',
   '{"uz": "Ishlab chiqarishni yakunlash", "ru": "Завершение производства"}'::jsonb),
  (gen_random_uuid()::text, 'production', 'CANCEL', 'production:cancel',
   '{"uz": "Ishlab chiqarish hujjatini bekor qilish (storno)", "ru": "Отмена производственного документа (сторно)"}'::jsonb)
ON CONFLICT ("slug") DO NOTHING;

-- Production was guarded by inventory permissions until now, so every role
-- (system or tenant) keeps what it could do: inventory:view -> view,
-- inventory:create -> create + edit + complete, inventory:edit -> edit +
-- cancel, inventory:delete -> delete. For system roles this equals
-- SYSTEM_ROLES in permission-catalog.ts.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid()::text, rp."role_id", target."id"
  FROM "role_permissions" rp
  JOIN "permissions" source ON source."id" = rp."permission_id"
  JOIN "permissions" target
    ON (source."slug" = 'inventory:view'   AND target."slug" = 'production:view')
    OR (source."slug" = 'inventory:create' AND target."slug" IN ('production:create', 'production:edit', 'production:complete'))
    OR (source."slug" = 'inventory:edit'   AND target."slug" IN ('production:edit', 'production:cancel'))
    OR (source."slug" = 'inventory:delete' AND target."slug" = 'production:delete')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- super_admin / company_admin hold every permission.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid()::text, r."id", p."id"
  FROM "roles" r
  JOIN "permissions" p ON p."module" = 'production'
 WHERE r."tenant_id" IS NULL AND r."is_system_role" = true
   AND r."slug" IN ('super_admin', 'company_admin')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
