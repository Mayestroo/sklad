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
- [ ] **ZRU-547 data localisation.** The Law on Personal Data requires
      personal data of Uzbek citizens to be stored on servers in Uzbekistan.
      Production currently runs on Neon in Singapore. Get a legal answer and,
      if required, move the database (or the personal-data part) to a local
      host before real tenants onboard.
- [ ] **Rate limiting is not enforced.** `ThrottlerModule` is configured
      (100 requests/minute) in `app.module.ts`, but no `ThrottlerGuard` is
      registered, so no route is limited (login and registration included).
      Register it globally (behind the proxy, trust the forwarded IP) and give
      auth routes a stricter limit.
- [ ] **Registration email enumeration.** `POST /api/auth/register` answers
      `409 A user with this email address already exists` when the admin email
      is taken (`AuthService.registerCompany`), so anyone can probe which emails have
      accounts. Login no longer reveals this; registration still does. Fix by
      answering the same way for taken and free emails (e.g. confirm by email
      before creating the tenant) and/or rate-limiting the route.

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
