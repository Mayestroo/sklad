# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Sklad is a multi-tenant inventory / warehouse / trade ERP for businesses in Uzbekistan (bilingual Uzbek + Russian). Operators work with business documents (receipts, invoices, orders, payments); the backend automatically derives double-entry journal postings, FIFO batch costing, landed cost, and counterparty settlements behind the scenes.

See also `AGENTS.md` (issue tracker = GitHub issues via `gh`, triage labels, domain docs layout).

## Repository layout

- `backend/` — NestJS 11 + Prisma 7 (Postgres via `@prisma/adapter-pg`). Run commands from here.
- `frontend/` — Next.js 16 (App Router) + React 19 + next-intl + Tailwind 4. Run commands from here. **Read `frontend/AGENTS.md`**: this Next.js version has breaking changes vs. training data; consult `frontend/node_modules/next/dist/docs/` before writing Next-specific code.
- `shared/` — plain TS types/constants imported by both sides (no package.json). Backend imports via relative paths (`../../../../shared/types`), frontend via the `@shared/*` alias.
- `docker-compose.yml` — Postgres 16 + Redis 7 for local dev. Copy `.env.example` → `.env` (backend reads `backend/.env`).
- `CONTEXT.md` — domain glossary. `docs/adr/` — architectural decisions. Read the relevant ADRs before changing purchases, sales, finance, settlements, or accounting logic, and use glossary terms (not the listed "_Avoid_" synonyms) in code, tests, and issues.

## Commands

Infrastructure: `docker compose up -d`

Backend (`cd backend`):
- `npm run start:dev` — API on :3001, Swagger at `/api/docs`
- `npm run build`, `npm run lint` (eslint with `--fix`), `npm run format`
- `npm test` — Jest unit tests (`src/**/*.spec.ts`, no database); single file: `npx jest src/modules/finance/finance-settlement.spec.ts`, single test: add `-t "name"`
- `npm run typecheck` — tsc over src **including specs** (Jest uses isolatedModules and does not type-check)
- DB-backed tests (`*.int-spec.ts`, `test/*.e2e-spec.ts`) refuse to run unless `DATABASE_URL_TEST` points at a disposable database different from `DATABASE_URL`: `docker-compose up -d postgres`, create `sklad_test`, then `npm run test:db:prepare` (`migrate deploy` via `prisma.test.config.ts`, which never reads `.env`; needs an empty database), `npm run test:integration`, `npm run test:e2e`. Use `127.0.0.1`, not `localhost`, if another Postgres owns `::1:5432`.
- **`backend/.env` points at a real Neon database with tenant data.** Never run seeds, migrations/resets or DB-backed tests against it. In Git Bash, `npx` may drop inline env vars — call `./node_modules/.bin/<tool>` when passing env inline.
- `npm run db:migrate` (prisma migrate dev), `db:generate`, `db:reset`, `db:seed`, `db:studio`
- `npm run create:superadmin`, `npm run settlement:reconcile` (recompute counterparty settlement balances)

Frontend (`cd frontend`):
- `npm run dev` (:3000), `npm run build`, `npm run lint`
- `npm test` — Node's built-in test runner (`node --test --experimental-strip-types`) over an **explicit file list** in `package.json`; add new `*.spec.ts` files to that script. Single file: `node --test --experimental-strip-types src/lib/utils.spec.ts`

## Backend architecture

- `src/app.module.ts` wires feature modules under `src/modules/` (inventory, sales, purchases, finance, settlements, accounting, services, production, fixed-assets, opening-balances, dashboard, analytics, billing, tenants, users, auth, super-admin, audit). There is no global prefix — each controller declares the full path, e.g. `@Controller('api/finance')`.
- `modules/sales/` is broad: it also contains counterparties, CRM, orders, invoices, payments, and some purchase code.
- **Multi-tenancy**: `JwtAuthGuard` → `TenantGuard` sets `request.tenantId` from the JWT (super-admins may target a tenant with the `X-Tenant-Id` header); read it with `@CurrentTenant()`. There is no automatic tenant scoping: every query on tenant data filters by `tenantId` explicitly (`where: { id, tenantId }`; `findUnique` by id alone is not tenant-isolated, so look the row up with `findFirst({ where: { id, tenantId } })` first). Permissions via `@RequirePermissions` + `PermissionsGuard`.
- `PrismaService` auto-seeds an empty database on startup (`common/prisma/seed-helper.ts`).
- Global `ValidationPipe({ whitelist, transform })` and `HttpExceptionFilter` (bilingual error messages). `I18nMiddleware` sets `req.locale` (`uz` default, or `ru`) from `Accept-Language`.
- Document posting is transactional and side-effecting: posting/unposting receipts, invoices, returns, and payments creates/reverses product batches, batch consumptions, stock, journal entries (BHMS/NAS accounts like 2910, 4410, 6010, 5010/5110 — ADR 0006), and settlement records. Edit/delete of posted documents goes through unpost → modify → repost (ADR 0020), guarded by rollback invariants (ADR 0004).
- Migrations in `prisma/migrations/` start from a single baseline (`20261112000000_baseline`) and must build a fresh database that matches `schema.prisma`. Database-level invariants that Prisma cannot express (currency CHECK constraints, cash-account/payment guard triggers) live only in migrations — never build a database with `db push`. Write idempotent SQL when touching existing columns/constraints.
- **FIFO batches**: take goods out only through `consumeFifoBatches` and add cost layers through `createFifoBatch` (`modules/inventory/fifo/fifo-batches.ts`), with the document's transaction client. It is all-or-nothing (no catalog-cost fallback), guards against concurrent over-consumption, and records `BatchConsumption` against exactly one source line so `restoreBatchConsumptions` can undo it. `landedCost` on a batch is per unit, in UZS.
- **Document numbers** come from `nextDocumentNumber(db, tenantId, series)` in `common/sequences/document-sequence.ts` (atomic per-tenant counter in `document_sequences`; pass the transaction client when inside one). Never derive a number from `count() + 1`. Unit specs with a mocked Prisma client opt into the in-memory fake with `jest.mock('<path>/common/sequences/document-sequence')`.
- Contract rules enforced by tests: every tenant write route needs `PermissionsGuard` + a permission from `common/auth/permission-catalog.ts` (`permission-catalog.spec.ts`; lifecycle actions like post/unpost are `<module>:edit`); every `@Body()` must be a class-validator DTO (`common/http/request-validation.spec.ts`). Prisma `Decimal` serializes as a JSON number (set in `prisma.service.ts`). Automatic journal postings take the caller's transaction client (`JournalService` `db` parameter) and must not be wrapped in try/catch. `JournalService.createJournalEntry` is the only writer of journal entries — never call `tx.journalEntry.create` directly; pass the document date as `entryDate` (it selects the `JE-YYYY-NNNNN` series).

## Frontend architecture

- Routes live under `src/app/[locale]/` with route groups `(auth)`, `(dashboard)`, `(superadmin)`; i18n setup in `src/i18n/`, strings in `messages/uz.json` and `messages/ru.json` — every user-facing string needs both.
- API access through `apiFetch` in `src/lib/api.ts` (adds Bearer token, `X-Tenant-Id`, `Accept-Language`; base `NEXT_PUBLIC_API_URL`, default `http://localhost:3001/api`). Data-loading helpers in `src/lib/useApiData.ts` and `src/lib/cache.ts`.
- Global contexts: `AuthContext`, `ConfirmContext` and `ToastContext` (use these for confirmations/notifications instead of browser dialogs — ADR 0021).
- Business math (pricing, inventory cost, cash-account policy) lives in `src/lib/*.ts` with spec files alongside.

## Project-wide invariants (from ADRs)

- **No silent fallbacks for required business data** (ADR 0022): never `currency || 'UZS'`, `exchangeRate || 1`, `quantity || 1`, `tenantId || ...`. Fail with `BadRequestException`. Currency must be explicit (`@IsValidCurrency()`); when currency ≠ `UZS`, `exchangeRate > 0` is required.
- **Multi-currency**: KPIs and balances are segregated per currency, never summed across currencies (ADR 0023); cash accounts are isolated by currency.
- **Currency display** (ADR 0010): `formatCurrency(amount, locale, currency)` already appends the ISO code — never append it again; use the shared `CURRENCY_OPTIONS` for selects.
