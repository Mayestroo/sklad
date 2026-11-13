/**
 * Jest manual mock for unit tests that run a service against a hand-written
 * Prisma mock without `accountingPeriod` / `$executeRaw`. Opt in with
 *   jest.mock('<relative path>/common/accounting-period/period-lock');
 * The check then always passes and records its calls, so a spec can still
 * assert which dates and action were checked. The real check is covered by
 * period-lock.spec.ts and accounting-periods.int-spec.ts.
 */
const actual =
  jest.requireActual<typeof import('../period-lock')>('../period-lock');

export type PeriodAction = import('../period-lock').PeriodAction;
export type PeriodKey = import('../period-lock').PeriodKey;
export type PeriodLockDb = import('../period-lock').PeriodLockDb;

export const periodOf = actual.periodOf;
export const periodLabel = actual.periodLabel;
export const periodLockKey = actual.periodLockKey;
export const closedPeriodError = actual.closedPeriodError;
export const assertPeriodOpen = jest.fn(() => Promise.resolve());
