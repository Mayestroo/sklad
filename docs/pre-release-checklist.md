# Before production checklist

Items that are acceptable on the dev database but must be settled before real
tenants use the system. Tick each one off in the PR that resolves it.

## Configuration

- [ ] **Click and Payme credentials are set** in the production environment.
      Without them every payment callback is refused (by design), so
      subscriptions cannot be paid:
  - `CLICK_MERCHANT_ID`
  - `CLICK_SERVICE_ID`
  - `CLICK_SECRET_KEY`
  - `PAYME_MERCHANT_ID`
  - `PAYME_SECRET_KEY`
- [ ] **Two different JWT secrets**: `JWT_SECRET` and `JWT_REFRESH_SECRET` are
      long random values, not the `.env.example` placeholders, and not equal to
      each other. The app refuses to start when either is missing or when they
      match (`backend/src/common/config/required-env.ts`), but it cannot tell a
      placeholder from a real secret.

## Data safety

- [ ] **Neon backup / point-in-time restore plan checked.** The application
      takes no backups itself; the super-admin backup endpoint answers 501 and
      points to Neon. Confirm on the production Neon project:
  - the plan's PITR (history retention) window is long enough for the business;
  - who can run a restore or create a branch from a past point, and that it has
    been tried once on a non-production branch;
  - whether additional off-Neon dumps are required (legal retention, ZRU-547).

## Security

- [ ] **Remove false security claims shipped to tenants.** The tenant
      *Settings → Security* page said all data is stored "in Uzbekistan
      (Tashkent Data Center)" with "30-day automatic backups" and carried a
      "LEX ZRU-547 COMPLIANT" badge. None of that is true: the database is on
      Neon in `ap-southeast-1` (Singapore) and the application takes no
      backups. Removed together with the other untrue cards on that page
      ("automatic tenant_id filter on every query, 0% leak risk", "JWT valid 7
      days", "100 requests/minute"). Before release, confirm no other page or
      marketing text repeats these claims.
- [ ] **ZRU-547 data localisation (owner decision, needs legal advice).**
      The Law on Personal Data (ZRU-547, art. 27-1) requires personal data of
      citizens of Uzbekistan to be collected, processed and stored on servers
      physically located in Uzbekistan. The production database is Neon,
      region `ap-southeast-1` (Singapore). It holds tenant user names, emails
      and phone numbers, and counterparty contact data. Hosting has **not**
      been changed in this branch. The owner must get a legal answer and
      decide before real tenants onboard; see "Decisions needed from owner".
- [x] **Rate limiting is enforced.** `ThrottlerGuard` is registered globally
      (`backend/src/common/rate-limit/rate-limit.ts`): 300 requests/minute per
      IP per route by default; login 5/minute, registration 5/hour; Click and
      Payme callbacks that fail authentication 10 per 15 minutes per IP
      (authenticated callbacks and their retries are never limited).
- [ ] **Set `TRUST_PROXY` in production** to the number of reverse-proxy hops
      in front of the API (usually `1`), or to the proxy addresses. Read once at
      startup (`configureTrustProxy` in
      `backend/src/common/rate-limit/rate-limit.ts`, called from `main.ts`).
      Without it every request appears to come from the proxy, so all users
      share one login limit and get 429 together. `true` is refused at startup
      (clients could spoof `X-Forwarded-For` and bypass the limits). Listed,
      empty, in `.env.example`.
- [ ] **Set `REDIS_URL` in production** (D5, done in round 2). With it the
      throttler counters live in Redis (`RedisThrottlerStorage`,
      `backend/src/common/rate-limit/throttler-storage.ts`): shared by every
      API instance, kept across restarts, one atomic Lua step per request.
      Without it the counters stay in process memory and the API logs a
      warning at startup in production. If Redis becomes unreachable the API
      keeps answering and counts in memory until it recovers (logged once a
      minute). Use a Redis reachable only from the API (password/TLS:
      `rediss://user:pass@host:port/db`).
- [ ] **Choose and configure a mail provider** (D3, round 3). Sign-up now
      sends a confirmation link by email through the provider-agnostic
      `MailTransport` (`backend/src/common/mail/`). Only a console transport
      exists: in development it writes the email (with the link) to the API
      log; in production it logs a warning and delivers nothing, so nobody
      can sign up until a real transport (SMTP or a mail API) is written,
      bound in `MailModule` and given its credentials. Links use
      `FRONTEND_URL` (already needed for CORS), so it must be the public web
      address in production.
- [ ] **Password reset has no route yet.** When it is added, give it
      `@Throttle(strictThrottle(...))` like login and registration.
- [ ] **Registration email enumeration** — code done in round 3 (D3,
      option a): `POST /api/auth/register` answers `202
      {status:'CONFIRMATION_SENT'}` for a free email, a taken email and a taken
      company address alike; the difference goes into the email. Done in
      production only after the migration and the mail provider above.
      Original note:
      `POST /api/auth/register` answers `409 A user with this email address
      already exists` when the admin email is taken
      (`AuthService.registerCompany`, `backend/src/modules/auth/auth.service.ts`),
      so anyone can probe which emails have accounts. Login no longer reveals
      this; registration still does. Mitigated, not fixed: the route is limited
      to 5 registrations per hour per IP. A real fix changes the sign-up flow
      (see "Decisions needed from owner").

## Migrations to apply to Neon (after owner approval, in this order)

Built and tested on the local Docker database only. Apply with
`npx prisma migrate deploy` against production **after a Neon backup /
branch**, never with `db push`. All are additive and idempotent.

- [ ] `20261113000000_accounting_periods` — `accounting_periods` table,
      `PermissionAction` values `CLOSE`, `REOPEN` (D4).
- [ ] `20261113000100_accounting_period_permissions` — `accounting:close` /
      `accounting:reopen` permission rows and system-role grants (D4).
- [ ] `20261113000200_pending_registrations` — `pending_registrations`
      table for sign-up by email confirmation (D3, round 3). **Apply to Neon
      later**: until it is applied, `POST /api/auth/register` fails on
      production.

## Accounting decisions

- [ ] **Purchase returns: configure the gap account** (D2, code path done in
      round 2). When returned goods leave at a landed cost below their base
      price, 6010 is reduced by the base price and the gap is credited to
      `Company.settings.accounting.purchaseReturnGainAccountCode`
      (`PATCH /api/tenants/settings`, must exist in the chart of accounts).
      Until the accountant sets it, such returns are **refused** with a clear
      error (no default account is invented). Candidate accounts: other
      operating income (e.g. 9390), FX gain (9540), or a 2910 cost correction.
      No settings UI yet (API only).

## Decisions needed from owner

Each item below has a safe default already in place, so nothing is blocked.
The owner should confirm the default or choose the alternative.

| # | Decision | Default in place now | Alternative(s) | Why the default |
|---|---|---|---|---|
| D1 | **ZRU-547 hosting**: may tenant personal data stay on Neon (Singapore)? | Nothing changed; hosting stays on Neon `ap-southeast-1`. The false "stored in Uzbekistan" claim was removed from the tenant UI. | Move the whole database to a host in Uzbekistan (e.g. a local cloud/DC Postgres), or split personal data into a local store. | Changing hosting is a legal/commercial decision and was explicitly out of scope. Needs a lawyer's answer before real tenants onboard. |
| D2 | **Purchase-return gap account** (landed cost below base price) | **Round 2**: the gap is posted Dt 6010 / Kt the account in `settings.accounting.purchaseReturnGainAccountCode`; not configured -> the return is refused with a clear error. | Choose the account: other operating income (9390), FX gain (9540), or a 2910 cost correction. | The account is an accounting policy choice; the code no longer leaves 6010 silently out of line. |
| D3 | **Registration email enumeration** | Unchanged: 409 for a taken email (and slug); 5 registrations/hour/IP. Round 2 checked: a uniform answer needs email confirmation (the answer carries login tokens today), which breaks the sign-up UX, so it was not changed. | (a) Email-confirmation sign-up ("check your inbox", tenant created on the link); (b) 201 for both, email the existing owner. Both need an email provider. | **Recommendation: (a)** once an email provider exists; it also verifies the address. |
| D4 | **Accounting period closing** | **Done in round 2** (ADR 0024): monthly periods, `accounting:close` (admin, accountant) / `accounting:reopen` (admin only), audit log. API only, no UI yet. | Yearly periods; let the accountant reopen too; a closing UI. | Owner asked for a minimal safe version. |
| D5 | **Rate-limit storage** | **Done in round 2**: Redis when `REDIS_URL` is set, in memory otherwise (production warning). | — | Owner asked for it in round 2. |
| D6 | **Opening-balance fixed assets and depreciation** (muammolar B6) | Round 2: accumulated depreciation typed per line, labelled "not computed" on the page, depreciation above cost rejected. Opening fixed assets do not enter the register and do not depreciate later. | **Option 1**: on posting, create a fixed-asset register entry per line (useful life, start date, method per line; the register then depreciates monthly). **Option 2**: link each line to an existing register asset (`fixedAssetId`) and post its opening value to it; assets are created in the register first. | **Recommendation: Option 2** — one source of truth for depreciation (the register), no duplicate asset creation, smaller change; needs the accountant to confirm the depreciation method and start month. |
| D7 | **Additional expenses under Sales** (muammolar B13) | **Round 2**: Sales menu "Sotuv xarajatlari" opens Finance → new expense (period expense). | A dedicated selling-expense document linked to invoices (for margin per invoice). | Reading of the PDF judged most probable; no new account or document. Owner to confirm the reading. |
| D8 | **Money format** | **Done in round 2.** One shared formatter (`shared/format/money.ts`): `8 000 UZS`, `8 000,50 UZS`, `1 234,56 USD`, quantities `2,5`; NBSP thousands, comma decimals. | Owner may still prefer always 2 decimals for UZS. | Owner asked for it in round 2. Input fields (`CurrencyInput`) keep their typing grammar (dot decimal, comma grouping while typing). |
| D9 | **Number inputs still use `1.000` (3 decimals, dot)** — seen in the visual check (finding F6) | Unchanged: `CurrencyInput` keeps its typing grammar (dot decimal, comma grouping while typing); displays use the new format. | (a) Same format as display (`1 000,5`), accept both `,` and `.` as decimal key; (b) keep dot decimal but drop trailing zeros (`1`, `0`). | **Recommendation: (b)** first (small, removes the "1.000 = thousand" reading without changing how people type), then (a) with a manual check of every form. |
| D10 | **Cancelled purchase payment leaves its journal entry** (finding F7, pre-existing) | Unchanged: Finance cancel reverses cash and settlement only. | Reverse (or delete) the payment's journal entry in the same cancel, through JournalService (period-checked). | **Recommendation**: do it; it is an accounting-integrity fix, but it changes ledger history for already-cancelled payments, so the accountant should confirm and a reconcile script should report past cases first. |

