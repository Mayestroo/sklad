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
- [ ] **Password reset has no route yet.** When it is added, give it
      `@Throttle(strictThrottle(...))` like login and registration.
- [ ] **Registration email enumeration (owner decision).**
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

## Accounting decisions

- [ ] **Purchase returns: where the gap goes when landed cost is below the
      base price.** A return takes goods out of 2910/1010 at batch landed cost
      (UZS) and should reduce the supplier payable (6010) by the base price at
      the document rate (ADR 0009). When landed cost is *above* the base price
      the excess goes to 9430/9420. When it is *below* (e.g. a USD receipt whose
      batches were costed at a lower rate, or rounding), 6010 is only debited
      with the landed cost and the difference stays unbooked
      (`PurchasesService` return journal, "Landed cost below the base price
      leaves that gap unbooked"). The ledger 6010 then disagrees with the
      counterparty settlement by that amount. The accountant must choose the
      account that takes the gain (other operating income, an FX gain account,
      or a 2910 cost correction) before this is coded.

## Decisions needed from owner

Each item below has a safe default already in place, so nothing is blocked.
The owner should confirm the default or choose the alternative.

| # | Decision | Default in place now | Alternative(s) | Why the default |
|---|---|---|---|---|
| D1 | **ZRU-547 hosting**: may tenant personal data stay on Neon (Singapore)? | Nothing changed; hosting stays on Neon `ap-southeast-1`. The false "stored in Uzbekistan" claim was removed from the tenant UI. | Move the whole database to a host in Uzbekistan (e.g. a local cloud/DC Postgres), or split personal data into a local store. | Changing hosting is a legal/commercial decision and was explicitly out of scope. Needs a lawyer's answer before real tenants onboard. |
| D2 | **Purchase-return gap account** (landed cost below base price) | Gap stays unbooked; 6010 is debited only with the landed cost (current behaviour, documented in the code). | Book the gain to other operating income (9390), to an FX gain account (9540), or as a correction of 2910 cost. | An accounting policy choice; coding a guess would create entries the accountant may have to reverse. |
| D3 | **Registration email enumeration** | Registration still returns 409 for a taken email; the route is limited to 5/hour per IP. | (a) Email-confirmation sign-up: always answer "check your inbox", create the tenant only after the link is clicked; (b) answer 201 for both, and email the existing owner instead. | Both alternatives change the onboarding UX and need an email provider, which the project does not have yet. |
| D4 | **Accounting period closing** | **Done in round 2** (ADR 0024): monthly periods, `accounting:close` (admin, accountant) / `accounting:reopen` (admin only), audit log. API only, no UI yet. | Yearly periods; let the accountant reopen too; a closing UI. | Owner asked for a minimal safe version. |
| D5 | **Rate-limit storage** | **Done in round 2**: Redis when `REDIS_URL` is set, in memory otherwise (production warning). | — | Owner asked for it in round 2. |
| D6 | **Opening-balance fixed assets and depreciation** (muammolar B6) | Accumulated depreciation typed per line; OB fixed-asset lines do not enter the fixed-asset register, so they do not depreciate afterwards. | Create a register asset per line at posting (useful life, start date, method per line), or link each line to an existing register asset, or a calculation helper only. | Accounting policy and a feature; see `docs/muammolar-triage.md` O1. |
| D7 | **Additional expenses under Sales** (muammolar B13) | No Sales menu entry; additional expenses exist only as purchase landed cost. | A selling-expense document (9410 group), or a Sales shortcut to Finance → Expense with a selling category. Do not reuse landed cost (it would capitalise selling costs into inventory). | Account choice and margin treatment; see triage O2. |
| D8 | **Money format** | **Done in round 2.** One shared formatter (`shared/format/money.ts`): `8 000 UZS`, `8 000,50 UZS`, `1 234,56 USD`, quantities `2,5`; NBSP thousands, comma decimals. | Owner may still prefer always 2 decimals for UZS. | Owner asked for it in round 2. Input fields (`CurrencyInput`) keep their typing grammar (dot decimal, comma grouping while typing). |

