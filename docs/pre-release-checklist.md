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

- [ ] **Registration email enumeration.** `POST /api/auth/register` answers
      `409 A user with this email address already exists` when the admin email
      is taken (`AuthService.registerCompany`), so anyone can probe which emails have
      accounts. Login no longer reveals this; registration still does. Fix by
      answering the same way for taken and free emails (e.g. confirm by email
      before creating the tenant) and/or rate-limiting the route.
