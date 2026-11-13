-- D4: register accounting:close / accounting:reopen for databases that were
-- seeded before they existed (startup seeding only runs on an empty
-- database). Grants follow SYSTEM_ROLES in permission-catalog.ts:
-- super_admin and company_admin get both, accountant gets close only.
-- Idempotent: safe to run again.

INSERT INTO "permissions" ("id", "module", "action", "slug", "description")
VALUES
  (gen_random_uuid()::text, 'accounting', 'CLOSE', 'accounting:close',
   '{"uz": "Hisobot davrini yopish", "ru": "Закрытие отчётного периода"}'::jsonb),
  (gen_random_uuid()::text, 'accounting', 'REOPEN', 'accounting:reopen',
   '{"uz": "Yopilgan davrni qayta ochish", "ru": "Повторное открытие закрытого периода"}'::jsonb)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid()::text, r."id", p."id"
  FROM "roles" r
  JOIN "permissions" p
    ON (r."slug" IN ('super_admin', 'company_admin') AND p."slug" IN ('accounting:close', 'accounting:reopen'))
    OR (r."slug" = 'accountant' AND p."slug" = 'accounting:close')
 WHERE r."tenant_id" IS NULL
   AND r."is_system_role" = true
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
